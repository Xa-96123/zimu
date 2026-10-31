# subtitle-speaker-annotation

给短剧字幕逐条标注"说话角色"的技能包：抽帧判角 → 新增缺失角色 → 批量打标 → 保存并刷新复核 → 自动下一集。

面向内部标注平台 `/videoedit/calibrationvideo`，通过 browser-use MCP 操作 Qoder 内置浏览器完成，全程留在平台页面内，不上传/导出视频。

## 安装

把整个仓库放进技能目录即可（任选其一）：

```bash
# 用户级（所有项目可用）
git clone https://github.com/Xa-96123/zimu.git ~/.qoder-cn/skills/subtitle-speaker-annotation

# 项目级（仅当前工作区）
git clone https://github.com/Xa-96123/zimu.git .qoder/skills/subtitle-speaker-annotation
```

安装后重启会话或执行 `/skills reload`。

## 使用

直接说需求，技能会自动触发，例如：

- "帮我做字幕标注"
- "继续标下一集"
- "从 drama_id=26471 第 60 集开始自动往下标"

或显式调用：`/subtitle-speaker-annotation`

## 依赖

- browser-use MCP（页面内 JS 执行、导航、截图），且平台已在**内置浏览器**中打开
- 平台页面结构见 `references/platform-dom.md`，若平台改版需同步更新选择器

## 结构

```
SKILL.md                 触发词、标注规则、每集流程、错误对照
references/platform-dom.md  选择器速查 + 可复制的页面内 JS 片段
```
