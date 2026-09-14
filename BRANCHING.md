# CivicPath repository branches

- `main` is the stable integration branch.
- `marketing` contains the public CivicPath marketing website.
- `app` contains the standalone CivicPath SaaS application: React frontend, Express API, MySQL/Sequelize schema, deployment configuration and technical documentation.

Changes should be developed on the branch that owns the relevant product surface, reviewed, then merged into `main` deliberately. Neither branch assumes the other application's deployment runtime.
