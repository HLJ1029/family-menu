# Humi UI Information Architecture V2

## Navigation

Humi keeps five primary destinations. Each destination owns one recurring household job.

| Level | Page | Job | Main scene |
| --- | --- | --- | --- |
| Primary | Tonight | See or arrange tonight's meal | Family dinner |
| Primary | Discover | Browse dishes and add one | Picking a dish |
| Primary | Plan | Arrange the week | Weekly calendar |
| Primary | Grocery | Buy and check ingredients | Checking a list |
| Primary | My Home | Manage family taste and account | Family profile |
| Secondary | Tonight Menu | Inspect the accepted menu | No extra hero scene |
| Secondary | Recommendation Detail | Review why a menu fits | Menu preparation |
| Secondary | Nutrition Calendar | Review eating history | Nutrition calendar |
| Secondary | Eating Profile | Review patterns and progress | Small achievement |
| Flow | Recipe Detail | Cook a selected dish | Reading a recipe |
| Flow | Collaboration Links | Join, vote, wish, share, or claim | State-specific collaboration scene |

## Asset Density

- Use one principal Lovart V2 scene per screen.
- Allow one small legacy character only for feedback, empty states, or a transient interaction.
- Do not add illustration frames when the scene can sit beside the related heading.
- Keep poster and social-cover assets out of product navigation. They belong to export and publishing flows.
- On mobile, hide secondary decoration before compressing content or buttons.

## Asset Roles

- `product` scenes: persistent page identity for the five primary destinations and four detail views.
- `collaboration` scenes: one scene per link state, including accepted, submitted, declined, and bought.
- `state` scenes: login, offline, sync, expired link, binding, loading, and empty data.
- `avatar` scenes: deterministic account and household member identities.
- `poster` scenes: poster generation only.
- `social` scenes: Xiaohongshu and other publishing previews only.
- Legacy 60-character library: compact feedback, empty-state, and playful micro-interaction support.
