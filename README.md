# 個人網站與留言板作業

這是一個可直接部署到 Vercel 的靜態網站作品，功能包含：

- 網站主人頭貼
- 網站主人自我介紹
- 訪客註冊與登入
- 訪客頭貼上傳（限制 jpg / jpeg / png）
- 會員留言板
- 僅能刪除自己的留言

## 專案檔案

- `index.html`：網站結構與作業內容
- `styles.css`：版面與視覺設計
- `app.js`：註冊、登入、頭貼上傳與留言板邏輯
- `assets/owner-avatar.svg`：網站主人示意頭像
- `vercel.json`：Vercel 靜態部署設定

## 注意事項

- 目前網站主人資訊為示範內容，可直接修改 `index.html` 中的姓名、自我介紹文字。
- 資料儲存在瀏覽器的 `IndexedDB`，所以同一台裝置、同一個瀏覽器重新開啟後仍可保留。
- 如果作業老師明確要求雲端資料庫，多人共用資料，後續可再改接 Supabase、Firebase 或 Vercel Postgres。

## Vercel 部署

這個專案不需要建置步驟，可直接當作靜態網站部署。

1. 將此資料夾上傳到 GitHub。
2. 到 Vercel 匯入該 repository。
3. Framework Preset 選擇 `Other` 或讓 Vercel 自動偵測。
4. Build Command 留空。
5. Output Directory 留空。
6. 部署完成後即可取得網址。
