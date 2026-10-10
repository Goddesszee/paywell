/**
 * about-faq-content.ts — built-in copy for the About and FAQ pages.
 *
 * Bundled with the app so these pages always render, even offline or when the
 * API is unreachable. Keep it in sync with what the app actually does.
 */

export interface AboutContent {
  headline: string
  tagline: string
  body: string
  mission: string
  contact: string
}

export interface FaqItem {
  id: string
  category: string
  question: string
  answer: string
  order: number
}

export interface AboutFeature {
  icon: string
  title: string
  desc: string
}

export const ABOUT: AboutContent = {
  headline: 'NAN — Your AI-powered money app',
  tagline: 'Send, swap, bridge and automate USDC. Just ask.',
  body: `NAN is a stablecoin app built on Arc, Circle's blockchain where USDC is the native gas token. You hold, send and receive USDC and EURC, move money between blockchains, swap tokens, and set up payments that run on a schedule, all from one simple app.

At the centre is the NAN Agent. Instead of hunting through menus, you tell it what you want in plain language, such as "send 10 USDC to 0x…", "swap 10 EURC to USDC" or "bridge 10 USDC to Base". It shows you exactly what it is about to do, and nothing moves until you confirm and approve it with your PIN, passkey or wallet.

You choose how to sign in: an email or Google account with a Circle wallet protected by your PIN, a passkey secured by your phone's biometrics, or an existing wallet such as MetaMask. No seed phrase is needed for email or passkey wallets.

NAN is built on Circle's developer stack: Circle wallets for secure key management, CCTP V2 for cross-chain USDC transfers, Circle Gateway for a single balance across chains, Circle's onramp for buying USDC, and Circle's agent tools so your AI agent can pay for services.

NAN currently runs on Arc Testnet. Testnet USDC has no real-world value, so it is a safe place to try everything.`,
  mission: 'To make money simple and programmable, so anyone, and any AI agent acting for them, can send, receive and automate payments anywhere in the world, quickly and at low cost.',
  contact: 'Need help? Open Support from the menu and submit a ticket. To report a bug, use Feedback. Have an idea? Share it on Suggestions. We read all of them.',
}

export const ABOUT_FEATURES: AboutFeature[] = [
  { icon: '🤖', title: 'NAN Agent', desc: 'Chat in plain language to send, swap, bridge, create invoices and payment requests, and more. You always confirm before money moves.' },
  { icon: '💸', title: 'Send & receive USDC', desc: 'Instant transfers on Arc with tiny fees paid in USDC. Share your address or QR code to get paid.' },
  { icon: '🌉', title: 'Cross-chain bridge', desc: 'Move USDC from Arc to Ethereum, Base, Arbitrum, OP, Polygon, Avalanche and more using Circle CCTP V2.' },
  { icon: '🔄', title: 'Token swap', desc: 'Swap between USDC, EURC and cirBTC on Arc with a live quote before you confirm.' },
  { icon: '🧭', title: 'Gateway', desc: 'Deposit once and use one unified USDC balance across chains, with near-instant transfers.' },
  { icon: '🔁', title: 'Recurring payments', desc: 'Schedule daily, weekly or monthly USDC payments and pause or cancel them any time.' },
  { icon: '🧾', title: 'Invoices & requests', desc: 'Create invoices and shareable payment-request links, and download account statements.' },
  { icon: '💳', title: 'Buy USDC & free test funds', desc: 'Buy USDC with the Circle onramp, or grab free testnet USDC from the Faucet.' },
]

export const FAQS: FaqItem[] = [
  // ── Getting Started ──
  { id: 'gs1', category: 'Getting Started', order: 1, question: 'What is NAN?', answer: 'NAN is a stablecoin app on Arc. You can send and receive USDC, swap tokens, bridge to other blockchains, set up recurring payments, and ask the built-in NAN Agent to do these things for you in plain language.' },
  { id: 'gs2', category: 'Getting Started', order: 2, question: 'How do I sign in?', answer: 'You have three options: (1) Email or Google, which creates a Circle wallet protected by your PIN; (2) Passkey, which uses your phone or computer biometrics; or (3) connect an existing wallet such as MetaMask. Email and passkey wallets need no seed phrase.' },
  { id: 'gs3', category: 'Getting Started', order: 3, question: 'Is NAN on testnet or mainnet?', answer: 'NAN currently runs on Arc Testnet. Testnet USDC has no real-world value and is meant for trying things out. You can get free testnet USDC from the Faucet page.' },
  { id: 'gs4', category: 'Getting Started', order: 4, question: 'What is Arc?', answer: 'Arc is a blockchain built by Circle where USDC is the native gas token. That means network fees are paid in USDC and stay small and predictable, with no need to hold another coin for gas.' },
  { id: 'gs5', category: 'Getting Started', order: 5, question: 'What is USDC?', answer: 'USDC is a dollar-backed stablecoin issued by Circle. 1 USDC is designed to always be worth 1 US dollar. NAN also supports EURC, a euro-backed stablecoin.' },
  { id: 'gs6', category: 'Getting Started', order: 6, question: 'Does NAN charge fees?', answer: 'Sending USDC on Arc only costs the tiny network fee. Swaps and bridges include a small NAN service fee, and bridges may also include Circle\'s network fee. The fees are shown before you confirm anything.' },

  // ── Wallet & Balances ──
  { id: 'wb1', category: 'Wallet & Balances', order: 1, question: 'What wallets does NAN have?', answer: 'Your Main Wallet holds your everyday USDC. The Agent Wallet is a separate wallet used by the NAN Agent for automated payments and paid services. The two balances are separate, and you decide how much goes into the Agent Wallet.' },
  { id: 'wb2', category: 'Wallet & Balances', order: 2, question: 'How do I add money to my wallet?', answer: 'Three ways: use the Faucet for free testnet USDC, use Buy USDC (Onramp) to purchase with a card or bank transfer, or have someone send USDC to your wallet address.' },
  { id: 'wb3', category: 'Wallet & Balances', order: 3, question: 'How do I find my wallet address?', answer: 'Open Receive from the Home screen or menu. You will see your address and a QR code you can share to get paid.' },
  { id: 'wb4', category: 'Wallet & Balances', order: 4, question: 'Can I connect MetaMask or another wallet?', answer: 'Yes. On the login page choose to connect a browser wallet such as MetaMask. You keep your own keys, and NAN will ask your wallet to approve each transaction.' },
  { id: 'wb5', category: 'Wallet & Balances', order: 5, question: 'Where can I see my transaction history?', answer: 'Open Activity from the menu. You can search and filter your transactions, view them on the explorer, and download statements from Generate Statement.' },

  // ── Sending & Receiving ──
  { id: 'sr1', category: 'Sending & Receiving', order: 1, question: 'How do I send USDC?', answer: 'Tap Send, enter the recipient\'s wallet address and the amount, then confirm. Email wallets approve with a Circle PIN, passkey wallets approve with biometrics, and browser wallets approve in the wallet app. You can also tell the NAN Agent, for example "send 10 USDC to 0x…".' },
  { id: 'sr2', category: 'Sending & Receiving', order: 2, question: 'How do I get paid by someone?', answer: 'Share your address or QR code from Receive, or create a Payment Request. A payment request gives you a shareable link with the amount and description, and the payer can open it and pay directly.' },
  { id: 'sr3', category: 'Sending & Receiving', order: 3, question: 'Can I set up recurring payments?', answer: 'Yes. Open Recurring and schedule a daily, weekly or monthly USDC payment to any address. You can pause, resume or cancel it any time, and the NAN Agent can manage it for you too.' },
  { id: 'sr4', category: 'Sending & Receiving', order: 4, question: 'I sent to the wrong address. Can I get it back?', answer: 'Blockchain transfers cannot be reversed. Always double-check the address before you confirm. If you sent to someone you know, ask them to send it back. Contact Support if you need help.' },
  { id: 'sr5', category: 'Sending & Receiving', order: 5, question: 'Can I create invoices?', answer: 'Yes. Ask the NAN Agent to create an invoice (for example "invoice Ada 50 USDC for design work, due 2026-11-01") or use Generate Statement to export your account activity.' },

  // ── NAN Agent ──
  { id: 'ag1', category: 'NAN Agent', order: 1, question: 'What is the NAN Agent?', answer: 'The NAN Agent is an AI assistant built into the app. It can see your balances, recent activity, recurring payments and requests, answer questions about them, and carry out actions for you when you ask.' },
  { id: 'ag2', category: 'NAN Agent', order: 2, question: 'What can I ask it to do?', answer: 'Examples: "What\'s my balance?", "Send 10 USDC to 0x…", "Swap 10 EURC to USDC", "Bridge 10 USDC to Base Sepolia", "Deposit 5 USDC into Gateway", "Set up a monthly payment", "Create a payment request for 20 USDC", "Show my recent transactions".' },
  { id: 'ag3', category: 'NAN Agent', order: 3, question: 'Will the agent spend my money without asking?', answer: 'No. For anything that moves money, the agent shows a confirmation card with the details and waits for you to confirm. You then approve with your PIN, passkey or wallet. Nothing is sent until you do.' },
  { id: 'ag4', category: 'NAN Agent', order: 4, question: 'What is the Agent Wallet?', answer: 'The Agent Wallet is a separate Circle wallet for your agent. You fund it with USDC, and the agent can use it to pay for services and automated payments within the spending limits you set. It cannot touch your Main Wallet balance.' },
  { id: 'ag5', category: 'NAN Agent', order: 5, question: 'What tokens and chains can the agent handle?', answer: 'Swaps support USDC, EURC and cirBTC on Arc Testnet. Bridges start from Arc and can go to Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy, Avalanche Fuji, Unichain Sepolia, Sei Testnet or World Chain Sepolia.' },

  // ── Bridge, Swap & Gateway ──
  { id: 'bs1', category: 'Bridge, Swap & Gateway', order: 1, question: 'What is the Bridge?', answer: 'The Bridge moves USDC from one blockchain to another using Circle CCTP V2, which burns USDC on the source chain and mints it on the destination. Your funds are not held by a third party along the way.' },
  { id: 'bs2', category: 'Bridge, Swap & Gateway', order: 2, question: 'How long does a bridge take?', answer: 'Usually a few minutes. It depends on the chains involved. You can follow each step (approve, burn, attestation, mint) on the Bridge page.' },
  { id: 'bs3', category: 'Bridge, Swap & Gateway', order: 3, question: 'What can I swap?', answer: 'On Arc Testnet you can swap between USDC, EURC and cirBTC. You get a live quote with the expected output and fees before you confirm. The default price tolerance (slippage) is 3%.' },
  { id: 'bs4', category: 'Bridge, Swap & Gateway', order: 4, question: 'My swap says there is no route. Why?', answer: 'Testnet liquidity is limited and sometimes unavailable. Wait a few seconds and try again, or try a smaller amount.' },
  { id: 'bs5', category: 'Bridge, Swap & Gateway', order: 5, question: 'What is Gateway?', answer: 'Circle Gateway gives you one unified USDC balance across supported chains. Deposit USDC once, then transfer it to another chain in about a second without waiting for a full bridge.' },

  // ── Buy & Faucet ──
  { id: 'of1', category: 'Buy USDC & Faucet', order: 1, question: 'How do I buy USDC?', answer: 'Open Buy USDC (Onramp), choose an amount and continue. The Circle onramp opens so you can pay by card or bank transfer. Circle handles identity checks and compliance.' },
  { id: 'of2', category: 'Buy USDC & Faucet', order: 2, question: 'What is the Faucet?', answer: 'The Faucet gives you free testnet USDC so you can try NAN. It has no real-world value.' },
  { id: 'of3', category: 'Buy USDC & Faucet', order: 3, question: 'How often can I use the Faucet?', answer: 'There is a 24-hour cooldown for each wallet address. If you run out, wait for the cooldown or use another address.' },

  // ── Security & Privacy ──
  { id: 'sp1', category: 'Security & Privacy', order: 1, question: 'Who controls my keys?', answer: 'Email and Google wallets are Circle wallets protected by your PIN, and Circle\'s infrastructure secures the keys. Passkey wallets are secured by your device biometrics. If you connect MetaMask or another wallet, you keep your own keys.' },
  { id: 'sp2', category: 'Security & Privacy', order: 2, question: 'Should I share my PIN or passkey?', answer: 'Never. NAN will never ask for your PIN, passkey, seed phrase or private keys, and neither will the NAN Agent. Only enter your PIN in the Circle approval window that opens from the app.' },
  { id: 'sp3', category: 'Security & Privacy', order: 3, question: 'What if I lose access to my account?', answer: 'Email and Google wallets can be recovered with the same email or Google account. Passkey wallets depend on your passkey, so keep it backed up with your device account. For an external wallet, recovery depends on your own seed phrase.' },

  // ── Troubleshooting ──
  { id: 'tr1', category: 'Troubleshooting', order: 1, question: 'My transaction is pending. What should I do?', answer: 'Check Activity for its status. Transactions on Arc normally confirm in seconds. If it stays pending for more than a minute or two, refresh and check again, then contact Support if it persists.' },
  { id: 'tr2', category: 'Troubleshooting', order: 2, question: 'The Circle PIN window did not appear.', answer: 'Your browser may be blocking pop-ups. Allow pop-ups for nanarc.xyz, then try again. If it still does not open, refresh the page and retry.' },
  { id: 'tr3', category: 'Troubleshooting', order: 3, question: 'I see "Something went wrong" or "Failed to fetch dynamically imported module".', answer: 'This happens when the app was updated while your page was open. Refresh the page (or close and reopen the app) to load the latest version. If it keeps happening, clear the site data for nanarc.xyz and reload.' },
  { id: 'tr4', category: 'Troubleshooting', order: 4, question: 'The agent says it can\'t reach the AI service.', answer: 'The AI service may be briefly unavailable. Basic questions about your balance, activity and recurring payments can still be answered from your account data, and full answers return automatically when the service recovers.' },
  { id: 'tr5', category: 'Troubleshooting', order: 5, question: 'How do I contact support?', answer: 'Open Support from the menu and submit a ticket with a short description of the problem. You can also use Feedback to report bugs and Suggestions to share ideas.' },
]
