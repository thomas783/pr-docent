# PR Docent demo

A tiny login service that lives only on PR Docent's demo branches, so there is a real pull request
to take a tour of. It is never merged into `main`.

Open one of the demo pull requests with the PR Docent extension installed and click **PR Docent**
on the Files changed tab:

- English: the open pull request from `demo/en-login-lockout`
- 한국어: the open pull request from `demo/ko-login-lockout`

Both make the same change; only the description, the tour and the short differ in language.

Run the tests with `node --test demo/auth/*.test.js`.
