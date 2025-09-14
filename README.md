# ⚖️ Decentralized Landlord-Tenant Dispute Resolution

Welcome to a fair, transparent way to resolve rental disputes on the blockchain! This project uses the Stacks blockchain and Clarity smart contracts to mediate conflicts between landlords and tenants, ensuring quick, impartial resolutions with trusted mediators. Say goodbye to endless court battles—empower users with decentralized justice.

## ✨ Features

🔍 **Easy Dispute Filing** - Tenants and landlords can create disputes with detailed claims  
🏢 **Mediator Marketplace** - Browse and select certified mediators based on reputation  
📂 **Secure Evidence Storage** - Upload hashes of photos, docs, or messages for tamper-proof proof  
🗳️ **Collaborative Resolution** - Mediators review evidence and propose binding decisions  
💰 **Escrow Integration** - Hold security deposits or payments until resolution  
📊 **Reputation Tracking** - Rate mediators and parties to build trust over time  
✅ **Automated Enforcement** - Smart contracts release funds or mark disputes as resolved  
🚫 **Anti-Abuse Measures** - Prevent frivolous claims with staking requirements  

Powered by 8 Clarity smart contracts for full decentralization.

## 🛠 How It Works

**For Tenants & Landlords**

- Register your profile (as tenant or landlord) with basic info like address and STX wallet  
- To start a dispute: Call `create-dispute` on DisputeManager with:  
  - Dispute type (e.g., unpaid rent, maintenance issue)  
  - Claim amount (in USD equivalent)  
  - Initial evidence hash  
- Stake a small fee (e.g., 0.1 STX) to deter spam—refunded if you win  

**For Mediators**

- Register as a mediator with credentials and pay a bonding fee for credibility  
- Browse open disputes via `get-open-disputes` and submit proposals with your fee quote  
- If selected: Access evidence via EvidenceVault, review, and call `propose-resolution` with:  
  - Recommended outcome (e.g., 70% refund to tenant)  
  - Rationale summary  
- Get rated post-resolution to boost your on-chain reputation score  

**Resolution Flow**

1. **File & Escrow**: Dispute created, funds escrowed in EscrowManager  
2. **Mediator Vote**: Parties approve a mediator from proposals (or auto-select top-rated)  
3. **Evidence Phase**: Both sides submit/add evidence (30-day window)  
4. **Decision**: Mediator finalizes via ResolutionEnforcer—parties can appeal once (extra fee)  
5. **Enforce**: Contracts auto-release funds, update reputations, and close the case  

Immutable, auditable, and cost-effective—resolving real-world rental headaches one block at a time!

## 📋 Smart Contracts (8 Total)

- **UserRegistry**: Manages tenant, landlord, and mediator registrations with roles and verification.  
- **DisputeManager**: Handles dispute creation, status tracking, and basic validation.  
- **MediatorSelector**: Proposals, voting, and selection logic for impartial mediation.  
- **EvidenceVault**: Secure storage and retrieval of evidence hashes with access controls.  
- **EscrowManager**: Locks/unlocks funds (e.g., deposits) tied to disputes.  
- **ResolutionEngine**: Processes mediator decisions, appeals, and final outcomes.  
- **ReputationSystem**: Tracks ratings, scores, and bonding for all participants.  
- **FeeHandler**: Manages staking, refunds, and mediator payouts automatically.  

Built in Clarity for Stacks—deploy with confidence! Check the `/contracts` folder for full code.