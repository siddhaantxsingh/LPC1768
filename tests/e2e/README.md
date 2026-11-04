Browser end-to-end checks (Playwright). Start a server first:

    npm run build && npx vite preview --port 4173

then run

    node tests/e2e/e2e_programs.cjs   # runs all 84 examples in the UI and checks results
    node tests/e2e/e2e_ui.cjs         # clicks every control and checks its effect
