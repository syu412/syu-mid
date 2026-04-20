# 個人網站與留言板作業

這是一個可部署到 Vercel 的動態網站作品，功能包含：

- 網站主人頭貼
- 網站主人自我介紹
- 訪客註冊與登入
- 訪客頭貼上傳（限制 jpg / jpeg / png）
- 會員留言板
- 僅能刪除自己的留言
- 伺服器端登入驗證與資料庫儲存

## 專案檔案

- `index.html`：網站結構與作業內容
- `styles.css`：版面與視覺設計
- `app.js`：註冊、登入、頭貼上傳與留言板邏輯
- `assets/owner-avatar.svg`：網站主人示意頭像
- `api/`：Vercel Functions API 與資料庫存取層
- `package.json`：動態專案依賴設定
- `vercel.json`：Vercel 靜態部署設定
- `.env.example`：資料庫環境變數範例

## 注意事項

- 目前網站主人資訊為示範內容，可直接修改 `index.html` 中的姓名、自我介紹文字。
- 目前改為伺服器端動態網站，帳號、密碼驗證、登入狀態與留言資料都由 Vercel Functions 搭配 Postgres 處理。
- 密碼不會明碼存放，而是以 Node.js `scrypt` 雜湊後再寫入資料庫。
- 頭貼目前以 Data URL 形式儲存在資料庫，適合作業展示；若要正式上線，建議改接 Blob 或物件儲存。

## 環境變數

- `DATABASE_URL`：Postgres 連線字串

## Vercel 部署

1. 在 Vercel Marketplace 或其他 Postgres 供應商建立資料庫。
2. 將 `DATABASE_URL` 加入 Vercel 專案環境變數。
3. 將此資料夾上傳到 GitHub。
4. 到 Vercel 匯入該 repository。
5. Framework Preset 選擇 `Other` 或讓 Vercel 自動偵測。
6. 第一次收到 API 請求時，系統會自動建立 `users`、`sessions`、`messages` 資料表。
7. 部署完成後即可使用動態註冊、登入與留言功能。
