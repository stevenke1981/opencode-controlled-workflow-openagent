# Safety Boundaries

Auto continue 很容易失控，所以本包預設採安全權限。

## 預設禁止

- `git rm`
- `rm`
- `del`
- `Remove-Item`
- `git reset --hard`
- `git clean`
- 格式化磁碟、清除資料、刪除大型資料夾
- 任何憑證、token、private key 輸出

## 需要 ask 的操作

- 編輯檔案。
- 執行未知 script。
- 安裝套件。
- 網路存取。
- 產生或修改 build artifact。

## 可以 allow 的低風險操作

- `git status`
- `git diff`
- `rg` / `grep`
- `cat` / `type`
- `ls` / `dir`
- 明確測試指令，如 `cargo test`、`npm test`、`pytest`

## Agent 權限分離

唯讀角色：
- Explore
- Librarian
- Oracle
- Metis
- Momus
- Multimodal Looker

可改檔角色：
- Sisyphus
- Hephaestus
- Atlas
- Sisyphus Junior

## Stop patterns

hook 遇到以下字樣應停止：

```text
BLOCKED:
WAITING_FOR_USER:
PERMISSION_REQUIRED:
AUTH_ERROR:
TOKEN_LIMIT:
USER_CANCELLED
```

## 使用者常見 Windows 限制

若你在 Windows 專案中使用 OpenCode，建議把破壞性命令維持 deny，尤其是：

```powershell
Remove-Item
rd /s
rmdir /s
del /f /s
```
