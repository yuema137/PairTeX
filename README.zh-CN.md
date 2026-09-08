[English](README.md) | **简体中文**

# PairTeX

## 给任何本地 LaTeX 项目加一层轻量的人机协作写作

**本地插上就能用。源码还是你自己的。agent 你自己挑。**

PairTeX 是啥？说白了，就是给已经在本地跑着的 LaTeX 项目外挂一层评审界面。
它小、确定、随时可插拔。先看它到底干了啥：把编译好的稿子变成一个能读、能改、
能留言的 HTML 页面，再把你在页面上的每一次操作记成结构化的反馈文件，交给你自己
的 coding agent 去处理。

PairTeX 不接管你的项目。编译器、Git、agent，该谁干的还是谁干。原来那个 LaTeX
仓库始终是唯一权威来源，站在 PairTeX 的角度它是只读的；HTML 和反馈文件都是随时
可以删掉的附属产物。

<p align="center">
  <img src="docs/assets/pairtex-loop.svg" alt="PairTeX 的循环：一份一次性的人类 HTML 视图，把结构化反馈和一个不被改动的权威 LaTeX 仓库连起来" width="100%">
</p>

<p align="center">
  <img src="docs/assets/pairtex-demo.png" alt="PairTeX 演示：可读的论文页面、Edit 与 Review 模式，以及带定位、回复、编辑、删除操作的反馈卡片" width="100%">
</p>

整个流程就这么回事：人读 HTML 投影、写评审意见，PairTeX 把这些意见落成可以搬走
的反馈文件，剩下的由你自己的 coding agent 决定怎么消化、怎么去改那个权威的 TeX
仓库。

## 为什么会有 PairTeX

[Prism](https://openai.com/prism/) 和 [Overleaf](https://www.overleaf.com/)
是完整的在线写作工作台。PairTeX 不是。它是个很小的本地适配层，面向那些已经有
LaTeX 仓库、有构建流程、有 Git 历史、也有 coding agent 的项目。

| | Prism | Overleaf | PairTeX |
| --- | --- | --- | --- |
| 类型 | 云端 AI 工作台 | 在线 LaTeX 编辑器 | 本地插件 |
| 源码放哪 | Prism 项目里 | Overleaf 项目里 | 你现有的仓库 |
| 人用的界面 | 编辑器 + AI | 编辑器 + 批注 | HTML 评审页 |
| agent | 内置 AI | 外部 / Git | 任意 agent |
| Git | 暂不支持 | 付费套餐同步 | 原生 |
| 源码安全 | 平台直接改 | 平台直接改 | 只读 |
| 必须用 AI | 是 | 否 | 否 |

### 什么时候该用 PairTeX

* 论文已经在本地 Git 仓库里了；
* 现有的编译器、模板、宏、构建脚本一个都不能动；
* 人想要一个读起来舒服的 HTML 评审界面，但不想把整个项目搬进另一个工作台；
* 团队想自己挑 coding agent；
* 反馈要留在本地、可审计、跟 commit 对得上、能随时搬走；
* 哪天不想用了，把 PairTeX 摘掉，稿子项目一个字不变。

PairTeX 不是拿来替代 Prism、Overleaf 或者 coding agent 的。它的长处是能叠加：
加一层给人看的评审界面和一个交给 agent 的接口，你的源码、工具链和归属关系全都
不动。

Prism 现在支持导入 LaTeX 项目，但它的[官方帮助文档](https://help.openai.com/en/articles/20001050-troubleshooting-and-getting-help-in-prism)
写着 Git 集成还没上。Overleaf 把 Git 和 GitHub 同步写成了部分套餐可用的集成功能。
PairTeX 是 Git 原生的，而且不用把项目搬进另一个工作台。

这么一来，人有了顺手的稿子界面，coding agent 还待在它本来就熟的那个仓库里干活。
HTML 层和反馈文件都属于插件自己的一次性产物，原来的 TeX 项目保持干净，从 PairTeX
这边看是只读的。

上面那张演示截图就是人这边能看到的全部界面。人在 HTML 里操作，PairTeX 把这些动作
记成独立的反馈文件，放在 `.pairtex/feedback/` 下面。评论就还是评论；Edit 和
Review 这两种模式产生的是结构化的改动条目。每张卡片都能定位回稿子里，能回复、
能编辑、能删。这些条目怎么消化、改完权威 TeX 之后要不要标成已解决，由 coding
agent 决定。

## 快速开始

把 PairTeX 指向一个已有项目和一个已经渲染好的 HTML 文件：

```sh
python3 pairtex.py \
  --project /path/to/paper \
  --html /tmp/pairtex-rendered/main.html \
  --port 8765
```

打开 PairTeX 打印出来的地址（一般是 <http://127.0.0.1:8765/>）。要是这个端口被
占了，PairTeX 会自动往下找一个能用的本地端口。反馈写在
`/path/to/paper/.pairtex/feedback/` 下面的独立文件里，稿子本身不动。

每个人都可以拿自己的那份临时 HTML 投影跑一份 PairTeX。这些投影之间 PairTeX 不做
同步。

## 公开 demo

### 最小交互 demo

```sh
python3 pairtex.py \
  --project demo/fixture \
  --html demo/fixture/rendered.html \
  --port 8765
```

这个独立 fixture 演示的是评论、Edit/Review 模式、公式编辑、反馈持久化、讨论串和
章节导航。它不依赖那篇没公开的 SIDERIUS 论文。

### 会议模板 demo

仓库里放了同一篇合成论文的三个公开版本，分别套 ICLR、NeurIPS、ICML 的外壳：

```sh
python3 pairtex_render.py \
  --project demo/iclr \
  --input main.tex \
  --output /tmp/pairtex-iclr-rendered \
  --build-command 'latexmk -pdf -interaction=nonstopmode -halt-on-error {input}'

python3 pairtex.py \
  --project demo/iclr \
  --html /tmp/pairtex-iclr-rendered/main.html \
  --port 8766
```

对应的项目是 `demo/neurips/` 和 `demo/icml/`。它们用来测公式、引用、图、表、章节、
小节，以及不同会议的样式，同样不涉及 SIDERIUS 的内容。

## 人和 agent 怎么配合

权威 TeX 源码上的一次 commit，就是一轮协作。完整的一圈是这样：

### 1. 让 agent 把 PairTeX 起起来

在 LaTeX 仓库里发这段 prompt：

```text
Read and follow skills/pairtex-agent/SKILL.md. Use PairTeX to render this existing LaTeX repository into a disposable local HTML projection. Discover the manuscript entry point and use the repository's existing build workflow. Do not modify any canonical source files. Start the PairTeX localhost view and report the URL, source HEAD commit, dirty state, render command, and HTML output path.
```

这段话要求 agent 做的是：读并遵守那个 skill，自己找到稿子的入口文件，用仓库现成的
构建流程渲染出一份一次性的本地 HTML，不许动任何权威源码文件，然后起本地页面，
并把 URL、源码 HEAD commit、工作区有没有未提交的改动、渲染命令、HTML 输出路径都
报回来。

要是 agent 手里还没有这个 skill，从本仓库拿过去，或者先装到那个 agent 的 skill
目录里，再发 prompt。

这一步 agent 只该做两件事：构建/渲染，起本地页面。打开它报的地址，在 HTML 界面里
写评论、用 Edit 模式改、或者用 Review 模式提建议。PairTeX 把这些都写进
`.pairtex/feedback/`。

### 2. 让 agent 消化反馈

反馈写完之后，发这段：

```text
Read and follow skills/pairtex-agent/SKILL.md. Consume the open PairTeX feedback in .pairtex/feedback/. For each entry, use its commit and redundant source anchors to inspect the current repository, apply appropriate changes only to canonical source, and preserve existing project conventions. Build the paper and regenerate the PairTeX HTML projection. Resolve only feedback that is actually addressed; for anything ambiguous or intentionally deferred, leave it open and append a concise thread reply. Report the source diff, build result, render path, and feedback decisions.
```

这段要求 agent：读 `.pairtex/feedback/` 里还没关掉的条目；对每一条，用它带的 commit
和冗余的源码锚点回到当前仓库里核对，只改权威源码，并且保持项目现有的写法约定；
然后编译论文、重新生成 HTML 投影；只把真正处理掉的反馈标成已解决，含糊的或者故意
先放着的就留着不动，在讨论串里补一句简短回复；最后报告源码 diff、构建结果、渲染
路径，以及每条反馈的处置。

这一步 agent 只能改权威源码。它不该凭猜测把反馈标成已解决。一条评论可能变成一次
源码修改，也可能变成讨论串里的一个问题，或者一个说清楚了为什么不改的决定。Edit
模式的改动已经算是人明确表达的意图；Review 模式的改动在 agent 决定怎么处理之前，
一直只是个提议。

### 3. 刷新浏览器

agent 报告说 HTML 已经重新生成了，就在 PairTeX 页面上点 `Refresh`。页面会重新读
最新的 HTML 和反馈文件。它不编译 TeX，也不改源码。

一轮结束的时候，agent 应该把这次权威源码的改动 commit 掉，然后把这个源码 commit
记进解决状态的元数据里。反馈元数据可以单独 commit，方便通过 Git 交换。没处理的
条目就保持 open，并且收到一条讨论串回复。

完整的 schema、锚点规则、生命周期语义、讨论串格式和 agent 的边界，看
[`skills/pairtex-agent/SKILL.md`](skills/pairtex-agent/SKILL.md)。

## 渲染器适配

默认渲染器是 `make4ht`，但渲染这一步是可以换的。用 `--adapter-command` 传一个外部
适配器进来，细节看 [`docs/renderer-adapters.md`](docs/renderer-adapters.md)。

适配器跑在项目的一份一次性拷贝上。PairTeX 只负责校验并发布 HTML 投影，绝不会为了
让某个渲染器跑通就去改目标源码。

## 项目边界

PairTeX 是一个干净的、插上就走的层，不是 IDE，也不是 Overleaf 的替代品。它不提供
编译器、源码编辑器、参考文献管理、agent 框架、LLM 集成、CRDT 协同编辑，也不做
HTML 转回 LaTeX 那套东西。
