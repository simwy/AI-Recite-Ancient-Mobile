# 背诵提示功能设计

## 需求

背诵过程中，用户卡住时点击「提示」按钮，根据当前背诵进度显示原文下一个字。继续点击则逐字追加显示。用户背出提示的字后提示自动消失。录音全程不中断。

## 方案：基于 realtimeText 尾部匹配定位

### 新增数据字段

- `hintStartIndex`: 提示起始位置在原文汉字数组中的索引，-1 表示无提示
- `hintCharsShown`: 当前已显示的提示字数

### 定位算法 findRecitePosition()

1. 提取 realtimeText 中的汉字序列
2. 取尾部 N 个汉字（N=5~10）
3. 在原文汉字序列中搜索该子串
4. 匹配不到则缩短子串重试
5. 返回匹配位置 + 子串长度 = 用户当前背到的位置

### 提示流程

1. 点击「提示」→ findRecitePosition() 定位到 pos
2. 若 hintStartIndex == -1（无提示中）：hintStartIndex = pos, hintCharsShown = 1, hintCount++
3. 若已有提示且 hintStartIndex == pos：hintCharsShown++（不重复计 hintCount）
4. 若已有提示但 pos 变了（用户背了一段又卡住）：重置为新位置, hintCount++
5. 显示原文汉字 [hintStartIndex, hintStartIndex + hintCharsShown)

### 自动消失

watch realtimeText：提示显示中时，检查 realtimeText 尾部汉字是否包含提示字序列，匹配到则清除提示。

### UI

复用已有 .hint-area 和「提醒我」按钮（取消注释），录音状态下显示。

### 对 result 页影响

无。hintCount 已在传递链路中。
