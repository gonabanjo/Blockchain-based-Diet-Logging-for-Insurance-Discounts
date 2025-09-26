# 🍎 Blockchain-based Diet Logging for Insurance Discounts

Welcome to a revolutionary way to track and prove your healthy eating habits on the blockchain! This project uses the Stacks blockchain and Clarity smart contracts to create immutable diet logs. Users can demonstrate adherence to specific diet plans, which insurance companies can verify to offer premium discounts. Say goodbye to self-reported surveys and hello to transparent, tamper-proof proof of your wellness journey.

This solves the real-world problem of unverifiable health claims in insurance, where people often exaggerate or forget details, leading to higher premiums for everyone. By leveraging blockchain, we ensure data integrity, reduce fraud, and incentivize healthy behaviors.

## ✨ Features

📅 Submit daily diet logs with timestamps  
🔍 Immutable records for verifiable adherence  
🏆 Earn proofs for sticking to diet plans  
💰 Simulate insurance discount claims based on verified logs  
👥 User profiles with personalized diet goals  
✅ Multi-plan support (e.g., keto, vegan, low-carb)  
🚫 Prevent tampering or duplicate entries  
📊 Generate reports for insurance verification  
🔒 Privacy-focused: Logs are hashed for anonymity where possible  

## 🛠 How It Works

**For Users**  
- Register your profile and select or create a diet plan.  
- Submit daily logs with details like meals, calories, and nutrients (hashed for privacy).  
- Over time, verify your adherence to generate a proof.  
- Share the proof with your insurer to claim discounts.  

**For Insurers/Verifiers**  
- Query user adherence proofs without accessing raw data.  
- Validate against predefined plan rules for automated approvals.  

**Technical Flow**  
1. User registers via the UserProfile contract.  
2. They subscribe to a plan in DietPlan.  
3. Daily submissions go through DailyLog.  
4. AdherenceVerifier checks compliance over periods (e.g., 30 days).  
5. ProofGenerator issues a verifiable certificate.  
6. InsuranceClaim simulates discount redemption.  
7. TokenReward issues tokens for milestones.  
8. Admin handles updates and governance.  

Boom! Your healthy habits are now blockchain-certified, potentially saving you money on insurance.
