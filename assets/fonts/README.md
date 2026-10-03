# Bundled Roboto

Regular (400), Medium (500), and Bold (700) come from the official
[googlefonts/roboto hinted font source](https://github.com/googlefonts/roboto/tree/main/src/hinted).
The included Apache 2.0 license covers redistribution. These full TrueType files
are registered as `Roboto` so Flutter web uses local assets instead of fetching
its default typeface from Google Fonts at runtime. They add about 1.5 MB before
transport compression. Flutter's renderer resources are a separate concern.

SHA-256 of the committed font binaries:

- Regular: `56a45233d29f11b4dfb86d248e921939d115778f87325e7ae8cc108383d6664d`
- Medium: `2879a5ecb7fbfa13a7fc3e2cdd7fecbf73aa45e91b541dfdfa2c442eed0aac21`
- Bold: `61f89f8db49261c2f6106e8dccc35df7b2f7ed909020db40a3fc905e95f99334`
