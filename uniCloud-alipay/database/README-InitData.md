# 云数据库初始化说明

本目录下的 `*.init_data.json` 是**初始化数据**，需要导入到 **uniCloud 云端数据库** 后，应用才能读到对应数据。

## 为什么本地有数据但页面不显示？

应用运行时读取的是 **云端数据库**，不是本地的 `data/` 目录或本目录下的 init_data 文件。  
若从未在云端执行过「初始化」或「导入」，对应集合在云端是空的，页面就会显示「暂无」或空列表。

## 广场列表页（分组 + 古文）依赖的集合

以下集合需在云端有数据，广场子合集列表页才会显示分组和文章：

| 集合名 | 说明 |
|--------|------|
| `gw-square-categories` | 分类（如「热门」） |
| `gw-square-subcollections` | 子合集（如「100天100首古诗」） |
| `gw-square-subcollections-group` | 分组（如「第1～10天」） |
| `gw-square-text-relations` | 子合集–分组–古文关系 |
| `gw-ancient-texts` | 古文正文 |

其中 **`gw-square-subcollections-group`** 的 init_data 与本目录下的  
`gw-square-subcollections-group.init_data.json` 内容一致；  
**`data/gw-square-subcollections-group.json`** 仅作备份或脚本用，不会自动写入云端。

## 如何把 init_data 导入云端？

1. 在 **HBuilderX** 中打开本项目，并关联好 uniCloud（支付宝）云服务空间。
2. 在左侧找到 **uniCloud → 云数据库**，或打开 **uniCloud Web 控制台**。
3. 对需要初始化的集合执行：
   - **方式一**：在 HBuilderX 中右键 `uniCloud-alipay/database` 或对应 `*.schema.json` → **初始化云数据库** / **导入 DB Schema 及扩展校验函数**（若提供「导入 init_data」则一并执行）。
   - **方式二**：在 [uniCloud Web 控制台](https://unicloud.dcloud.net.cn) 进入对应服务空间 → 云数据库 → 选择集合（如 `gw-square-subcollections-group`）→ 使用「导入」功能，选择本地的 `gw-square-subcollections-group.init_data.json` 或从其中复制内容导入。

导入完成后，重新打开广场子合集列表页，分组和古文应能正常显示。
