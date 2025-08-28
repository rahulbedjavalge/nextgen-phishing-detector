# Next-Gen Phishing Detector

A Chrome MV3 extension that scores webmail pages with NLP-like heuristics and link analysis to flag phishing and spear-phishing risks. It overlays a risk badge, highlights suspicious links, and provides simple controls.

## Load the extension

1. Open Chrome or Edge. Go to `chrome://extensions` or `edge://extensions`.
2. Toggle **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder in this repo.
4. Open Gmail or Outlook Web and open an email. You should see a small risk card appear in the top right.

## What it checks

- Suspicious phrases like “verify your account”, “urgent”, “reset your password”
- Forms posting to external origins, presence of password fields
- URL red flags: IP addresses, punycode, @, suspicious TLDs, URL shorteners, sensitive keywords, long URLs, http
- Heuristics: lots of all-caps words, many exclamation points

The score uses a small logistic model in `content.js`. Tweak the `weights` to tune sensitivity.

## Options

- Toggle scanning and link highlighting in the popup
- Manage allowlist and blocklist on the Options page

## Dev tips

- Use GitHub Copilot to propose new suspicious words, custom rules for your org, and improve DOM selectors for your email client
- Add domain reputation using a small background fetch to a safe API you control. Store results in `chrome.storage.local` with a TTL

## License

MIT
