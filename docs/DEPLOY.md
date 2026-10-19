# GitHub公開手順

1. GitHubのログイン済みアカウントで https://github.com/new を開く。
2. リポジトリ名に `notebook-activity-extractor` を指定する。GitHub Pages公開に使うため、通常は **Public** を選択する（学校の個人情報や生徒の提出Notebookはコミットしない）。
3. 追加のREADMEの自動作成は省略し、このZIPを展開したフォルダ全体をリポジトリルートに配置する。
4. ターミナルで以下を実行する。

```bash
cd notebook-activity-extractor
git init -b main
git add .
git commit -m "Initial MVP: browser-only notebook activity extraction"
git remote add origin https://github.com/<YOUR-ACCOUNT>/notebook-activity-extractor.git
git push -u origin main
```

5. リポジトリの **Settings → Pages → Build and deployment → Source** で **Deploy from a branch** を選び、Branchに `main` と `/(root)` を指定して **Save** する。
6. 表示された Pages のURLへアクセスし、正本なし・正本あり・単体・フォルダ一括とNotebookのダウンロードを確認する。
7. 今後の改修はブランチで行い、テスト後に `main` へ統合する。公開中URLは変わらない。

**重要:** GitHub Pagesはアプリ自身（HTML/JavaScript）を配信するサービス。処理対象となる生徒のファイルはGitHubにアップロードする必要がなく、提出されたNotebookはブラウザ内だけで処理される。
