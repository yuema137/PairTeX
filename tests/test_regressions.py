from __future__ import annotations

import contextlib
import io
import json
import shlex
import subprocess
import sys
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

import pairtex
from pairtex_render import AssetParser, annotate_math_sources, run_renderer
from pairtex_validation import validate_rendered_html

MATH = '<math><mi>x</mi></math>'


class GitStateTest(unittest.TestCase):
    def test_source_states_and_persisted_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            html = project / 'main.html'
            html.write_text('<p>Paper</p>')
            app = pairtex.App(project, html)

            def check(expected, dirty, has_head=False):
                state = app.state()
                self.assertEqual(state['git_status'], expected)
                self.assertIs(state['worktree_dirty'], dirty)
                self.assertEqual(bool(state['head_commit']), has_head)
                metadata = {key: state[key] for key in ('git_status', 'head_commit', 'worktree_dirty')}
                saved = app.save_entry({'id': 'state', **metadata})
                persisted = json.loads((project / '.pairtex/feedback/state.json').read_text())
                self.assertEqual(persisted, saved)
                for key, value in metadata.items():
                    self.assertEqual(persisted[key], value)

            check('not_repository', None)
            def git(*args):
                subprocess.run(['git', '-C', tmp, *args], check=True, capture_output=True)
            git('init')
            check('unborn', True)
            (project / '.gitignore').write_text('.pairtex/\n')
            git('add', '.')
            git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture')
            check('clean', False, True)
            html.write_text('<p>Changed</p>')
            check('dirty', True, True)
            with patch('pairtex.subprocess.run', side_effect=OSError('git missing')):
                check('unavailable', None)
            original_run = subprocess.run
            def fail_status(args, **kwargs):
                if 'status' in args:
                    return subprocess.CompletedProcess(args, 128, '', 'fatal: index unreadable')
                return original_run(args, **kwargs)
            with patch('pairtex.subprocess.run', side_effect=fail_status):
                check('unavailable', None, True)


class ValidationTest(unittest.TestCase):
    def test_reject_unusable_math_for_all_wrappers(self):
        for wrapper in ('div', 'span'):
            for content in ('x', '<math/>', '<math></math>', '<math>x</math>',
                            '<math><mfrac><mrow>x</mrow><mrow>y</mrow></mfrac></math>',
                            '<math><mfrac><mi>x</mi></mfrac></math>',
                            '<math><mphantom><mi>x</mi></mphantom></math>',
                            '<math><semantics><mrow/><annotation>x</annotation></semantics></math>',
                            '<math><merror><mi>x</mi></merror></math>', '<svg/>', '<img>'):
                with self.subTest(wrapper=wrapper, content=content), self.assertRaises(ValueError):
                    validate_rendered_html(f'<{wrapper} data-editable="math" data-source-file="main.tex">{content}</{wrapper}>')

    def test_valid_native_and_image_fallbacks(self):
        for content in (MATH, '<math><mfrac><mi>x</mi><mn>2</mn></mfrac></math>',
                        '<math><semantics><mi>x</mi><annotation encoding="application/x-tex">x</annotation></semantics></math>',
                        '<svg><path d="M0 0 L10 10"/></svg>', '<img src="formula.png">'):
            validate_rendered_html(f'<span data-editable="math" data-source-file="main.tex"><span>{content}</span></span>')

    def test_nested_wrappers_and_unclosed_units_are_checked(self):
        for content in ('<span data-editable="math" data-source-file="main.tex"><div>x</div></span>',
                        '<span data-editable="math" data-source-file="main.tex">',
                        '<span data-editable="math">' + MATH + '</span>',
                        '<math>x</math>'):
            with self.assertRaises(ValueError):
                validate_rendered_html(content)


class MappingTest(unittest.TestCase):
    def test_adapter_anchors_preserved_with_unquoted_attributes(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            (p / 'main.tex').write_text('$x$')
            output = p / 'main.html'
            html = '<span data-editable=math data-source-file=other.tex data-source-line=42>' + MATH + '</span>'
            output.write_text(html)
            annotate_math_sources(p, p / 'main.tex', output)
            self.assertEqual(output.read_text(), html)

    def test_simple_input_order_and_actual_lines(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            (p / 'main.tex').write_text('\\documentclass{article}\n\\begin{document}\n$x$\n\\input{part}\n\\end{document}\n')
            (p / 'part.tex').write_text('Text\n$y$\n')
            output = p / 'main.html'
            output.write_text(MATH + MATH.replace('x', 'y'))
            annotate_math_sources(p, p / 'main.tex', output)
            html = output.read_text()
            self.assertIn('data-source-file="main.tex" data-source-line="3" data-math-source="x"', html)
            self.assertIn('data-source-file="part.tex" data-source-line="2" data-math-source="y"', html)
            self.assertLess(html.index('data-math-source="x"'), html.index('data-math-source="y"'))

    def test_uncertain_expansion_stays_read_only_even_with_equal_counts(self):
        for source, count in (
            ('\\iftrue\n$x$\n\\else\n$y$\n\\fi', 1),
            ('\\iftrue\n$x$\n\\else\n$y$\n\\fi', 2),
            ('$x$\n\\bibliography{refs}', 2),
            ('$x$\n\\printbibliography', 2),
            ('$x$\n$y$', 1),
            ('\\def\\shortpaper{1}\n\\input{main}', 1),
        ):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as tmp:
                p = Path(tmp)
                root = p / 'short.tex'
                root.write_text(source)
                (p / 'main.tex').write_text('\\input{part}\n\\ifappendix\n$y$\n\\fi')
                (p / 'part.tex').write_text('$x$')
                output = p / 'short.html'
                output.write_text(MATH * count)
                before = {path.name: path.read_bytes() for path in p.glob('*.tex')}
                with contextlib.redirect_stderr(io.StringIO()) as warning:
                    annotate_math_sources(p, root, output)
                self.assertIn('read-only', warning.getvalue())
                result = output.read_text()
                self.assertEqual(result.count('data-source-mapping="unmapped"'), count)
                self.assertNotIn('data-editable=', result)
                self.assertNotIn('data-source-file=', result)
                validate_rendered_html(result)
                self.assertEqual(before, {path.name: path.read_bytes() for path in p.glob('*.tex')})


class AssetTest(unittest.TestCase):
    def render(self, project, output, html, files=None, extra=''):
        adapter = project.parent / 'adapter.py'
        adapter.write_text('from pathlib import Path\nimport sys\no=Path(sys.argv[1])\n'
                           + f'(o/"main.html").write_text({html!r})\n'
                           + '\n'.join(f'(o/{name!r}).parent.mkdir(parents=True, exist_ok=True)\n(o/{name!r}).write_text({content!r})' for name, content in (files or {}).items())
                           + '\n' + extra)
        command = f'{shlex.quote(sys.executable)} {shlex.quote(str(adapter))} {{output}}'
        run_renderer(project, project / 'main.tex', output, None, '', None, command)

    def test_publish_only_declared_attachments_and_serve(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'project'; p.mkdir()
            (p / 'main.tex').write_text('No math')
            output = Path(tmp) / 'output'
            files = {'supplement.txt': 'text', 'nested/a b.pdf': 'pdf', 'code.zip': 'zip', 'private.txt': 'secret', 'style.css': 'p {}'}
            html = '<a href="supplement.txt">txt</a><a href="nested/a%20b.pdf?download=1#page=2">pdf</a><a href="code.zip">zip</a><link rel="stylesheet" href="style.css">'
            self.render(p, output, html, files)
            self.assertFalse((output / 'private.txt').exists())
            self.assertEqual((p / 'main.tex').read_text(), 'No math')
            app = pairtex.App(p, output / 'main.html')
            handler = type('TestHandler', (pairtex.Handler,), {'app': app})
            server = pairtex.create_server('127.0.0.1', 0, handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            connection = HTTPConnection('127.0.0.1', server.server_port)
            try:
                for url, content in (('/supplement.txt', 'text'), ('/nested/a%20b.pdf?download=1', 'pdf'), ('/code.zip', 'zip')):
                    connection.request('GET', url)
                    response = connection.getresponse()
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.read().decode(), content)
            finally:
                connection.close(); server.shutdown(); server.server_close(); thread.join()

    def test_external_and_fragment_urls_are_not_files(self):
        parser = AssetParser()
        parser.feed(''.join(f'<a href="{url}">link</a>' for url in ('#x', '?q=1#x', 'https://example.org/a', '//example.org/a', 'mailto:test@example.org', 'data:text/plain,x', 'blob:example')))
        self.assertEqual(parser.sources, [])

    def test_missing_unsafe_and_symlink_assets_rejected_before_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'project'; p.mkdir()
            (p / 'main.tex').write_text('No math')
            outside = Path(tmp) / 'private.txt'; outside.write_text('secret')
            for link in ('missing.txt', '../private.txt', '/private.txt', '%2e%2e/private.txt', 'file:///private.txt', 'nested/%2e%2e/private.txt', 'foo%5cbar'):
                with self.subTest(link=link), self.assertRaises((ValueError, RuntimeError)):
                    self.render(p, Path(tmp) / 'output', f'<a href="{link}">attachment</a>')
                self.assertFalse((Path(tmp) / 'output/main.html').exists())
            with self.assertRaises(ValueError):
                self.render(p, Path(tmp) / 'output', '<a href="secret.txt">secret</a>', extra=f'(o/"secret.txt").symlink_to({str(outside)!r})')
            (p / 'secret.txt').symlink_to(outside)
            with self.assertRaises(ValueError):
                self.render(p, Path(tmp) / 'output', '<a href="secret.txt">secret</a>')
            output = Path(tmp) / 'output'; output.mkdir()
            (output / 'public.txt').symlink_to(outside)
            with self.assertRaises(ValueError):
                self.render(p, output, '<a href="public.txt">file</a>', {'public.txt': 'public'})
            self.assertEqual(outside.read_text(), 'secret')

    def test_invalid_math_rejected_before_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'project'; p.mkdir()
            (p / 'main.tex').write_text('$x$')
            with self.assertRaises(ValueError):
                self.render(p, Path(tmp) / 'output', '<math>x</math>')
            self.assertFalse((Path(tmp) / 'output/main.html').exists())
