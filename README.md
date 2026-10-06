# OpenMontage 剪輯生成器整合

本專案提供 [OpenMontage](https://github.com/calesthio/OpenMontage) 的本機安裝與啟動入口。OpenMontage 是開源、agent-first 的影片製作工作區：AI coding assistant 負責導演與呼叫工具，影片合成及渲染在本機執行。**它不是可直接呼叫的雲端剪輯 API，也不會在本專案中偽裝成一個 API。**

## 快速開始

### 1. 安裝前置需求

- Python 3.10 或更新版本
- Node.js 18 或更新版本（含 npm）
- FFmpeg
- Git 與 `make`
- 支援的 AI coding assistant（依 OpenMontage 上游支援範圍）

### 2. 安裝 OpenMontage

在本專案根目錄執行：

```bash
./scripts/openmontage.sh install
```

上游原始碼會安裝在 `.local/openmontage/`（已加入 Git 忽略），並透過 OpenMontage 官方 `make setup` 安裝執行依賴。安裝目錄與上游版本可用 `OPENMONTAGE_DIR`、`OPENMONTAGE_REF` 環境變數覆寫；預設版本固定於已核對的上游 commit `9327439db69021ab4b0e2776729bf3b58fdb5a87`。

### 3. 開始製作

將 `.local/openmontage/` 作為工作目錄，在支援的 AI coding assistant 中開啟，並從自然語言需求開始，例如：

> 製作一支 45 秒繁體中文產品介紹短片，使用清楚的旁白、字幕和直式 9:16 輸出；先提出製作計畫供我審核。

透過包裝器取得工作目錄：

```bash
./scripts/openmontage.sh path
```

需要看本機製作看板時：

```bash
./scripts/openmontage.sh open
```

若尚無正式製作，可先啟動上游示範看板：

```bash
./scripts/openmontage.sh simulate
```

也可使用 Makefile 別名：

```bash
make openmontage-setup
make openmontage
make openmontage-demo
```

## 供應商金鑰與費用

OpenMontage 支援本機工具、免費／開放素材，以及可選的第三方媒體供應商。雲端生成供應商可能需要各自的 API 金鑰並產生費用；請只在本機 OpenMontage 工作目錄的 `.env` 中自行設定。**不要把金鑰貼到對話、提交至 Git，或放進本專案的整合腳本。** 此整合不會自動複製或上傳目前執行環境的憑證。

## 整合與授權說明

- 上游 OpenMontage 原始碼不會複製進本專案，而是安裝到 Git 忽略的 `.local/openmontage/`，並固定在已核對版本；這樣可保留上游著作權及其 **AGPL-3.0** 授權邊界。
- 安裝器只在安全情況下切換到設定版本；若安裝目錄有未提交變更會停止，避免覆寫本機資料。
- OpenMontage 是本機工作區／agent 工具鏈；此整合提供安裝、看板及示範產線入口，沒有宣稱提供網站嵌入或雲端 API。
- 上游專案及安裝需求：[OpenMontage GitHub](https://github.com/calesthio/OpenMontage)
