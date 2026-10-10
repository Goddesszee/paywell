import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600')
  return res.status(200).json({
    about: {
      headline: 'NAN — The Intelligent Money Layer',
      tagline: 'Your AI agent. Your wallet. Your rules.',
      body: `NAN is a next-generation financial platform that gives your AI agent a real, programmable USDC wallet — powered by Circle and built on Arc.

NAN lets you send and receive USDC instantly, bridge across chains, swap tokens, and set up recurring payments — all from one clean interface. What makes NAN different is the Agent Wallet: a dedicated wallet your AI agent can use to pay for services, automate payments, and execute transactions on your behalf, within limits you set.

Built on Arc — Circle's blockchain where USDC is the native gas token — NAN delivers sub-second finality and stable, predictable fees. No volatile gas surprises. No delays. Just fast, reliable USDC movement.

NAN integrates deeply with the Circle stack: Circle Agent Stack for agent payments, CCTP v2 for cross-chain bridging, Circle Gateway for unified cross-chain liquidity, Circle Onramp for fiat-to-USDC purchases, and Circle's modular wallet infrastructure for secure key management.`,
      mission: 'To make money programmable — giving every person and every AI agent the ability to send, receive, and automate payments anywhere in the world, instantly and transparently, without banks or borders.',
      contact: 'For support, use the Support page in the app. For business inquiries and partnerships, reach out via the Feedback page. NAN is built by a team focused on making AI-native finance accessible to everyone.',
      updatedAt: new Date().toISOString(),
    },
  })
}
