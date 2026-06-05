# Codex Working Memory

## Collaboration Rules

- For visual design work, ask for user confirmation before implementation.
- This includes brand direction, poster templates, UI visual style, layout direction, animation style, icon usage, and any change where taste/aesthetic judgment is central.
- The correct flow is:
  1. Create or show a preview/mockup.
  2. Discuss and revise the direction with the user.
  3. Implement only after the user confirms.
  4. Then run validation/build, commit, and push.
- Do not treat design changes like ordinary implementation tasks, even when the code path is clear.
- Functional bug fixes and non-visual infrastructure work can continue autonomously unless user confirmation is needed.

## Poster System Rule

- Poster template design must be previewed and confirmed before product code is changed.
- Do not directly commit poster template design changes after only internal judgment.
- Use Humi's existing recipe images for production poster previews and implementation.
- Do not call image-generation APIs for production poster generation.
