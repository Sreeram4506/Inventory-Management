import express from 'express';
import prisma from '../db/prisma.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { message, history } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const nvidiaApiKey = process.env.NVIDIA_API_KEY;
    if (!nvidiaApiKey || nvidiaApiKey === 'YOUR_NVIDIA_API_KEY_HERE') {
      return res.status(503).json({ error: 'AI Assistant is not configured on this server.' });
    }

    // 1. Gather Business Context
    const [
      availableVehicles,
      soldVehicles,
      sales,
      adsCount,
      adsSpendResult,
      expenseSumResult
    ] = await Promise.all([
      prisma.vehicle.findMany({
        where: { status: 'Available' },
        include: { purchase: true, repairs: true },
        orderBy: { purchaseDate: 'asc' } // Oldest first
      }),
      prisma.vehicle.count({ where: { status: 'Sold' } }),
      prisma.sale.findMany({
        select: { salePrice: true, profit: true, saleDate: true, vehicle: { select: { make: true, model: true, year: true } } },
        orderBy: { saleDate: 'desc' },
        take: 10
      }),
      prisma.advertisingExpense.count(),
      prisma.advertisingExpense.aggregate({ _sum: { amountSpent: true } }),
      prisma.businessExpense.aggregate({ _sum: { amount: true } })
    ]);

    const totalInventoryCost = availableVehicles.reduce((sum, v) => sum + (v.purchase?.totalPurchaseCost || 0) + v.repairs.reduce((rSum, r) => rSum + r.partsCost + r.laborCost, 0), 0);
    const totalRevenue = sales.reduce((sum, s) => sum + s.salePrice, 0);
    const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);
    const totalAdsSpend = adsSpendResult._sum.amountSpent || 0;
    const totalBusinessExpenses = expenseSumResult._sum.amount || 0;

    // Summarize oldest 5 cars
    const oldestCars = availableVehicles.slice(0, 5).map(v => 
      `${v.year} ${v.make} ${v.model} (VIN: ${v.vin}) - Cost: $${(v.purchase?.totalPurchaseCost || 0)}, In stock since: ${new Date(v.purchaseDate).toLocaleDateString()}`
    ).join('\n- ');

    // 2. Build System Prompt
    const systemPrompt = `You are the "Auto Profit Hub AI", an expert business advisor and growth expert for a vehicle dealership. 
You act as a proactive, professional, and strategic partner to the dealership owner.
Your goal is to increase profit margins, identify stale inventory, and give actionable advice.
Do not format with excessive markdown, keep it readable as a chat message.

### Live Business Data Context:
- Available Inventory: ${availableVehicles.length} vehicles
- Total Inventory Value (Purchases + Repairs): $${totalInventoryCost.toLocaleString()}
- Total Vehicles Sold: ${soldVehicles}
- Recent Revenue (last 10 sales): $${totalRevenue.toLocaleString()}
- Recent Profit (last 10 sales): $${totalProfit.toLocaleString()}
- Total Ad Spend: $${totalAdsSpend.toLocaleString()} across ${adsCount} campaigns
- Setup / Business Expenses: $${totalBusinessExpenses.toLocaleString()}

**Oldest Vehicles in Stock (Needs Attention):**
- ${oldestCars || 'No available inventory.'}

When asked for advice, refer to these numbers. Suggest lowering prices on older stock, or increasing ads for high-margin cars. Answer the user's specific questions using the data provided.`;

    const formattedHistory = (history || []).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

    // 3. Call NVIDIA API
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${nvidiaApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-70b-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          ...formattedHistory,
          { role: "user", content: message }
        ],
        temperature: 0.2, // Low temp for factual accuracy
        max_tokens: 500,
        stream: false
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error("NVIDIA API Error:", data.error);
      return res.status(500).json({ error: 'AI provider error' });
    }

    const aiMessage = data.choices[0].message.content;
    res.json({ reply: aiMessage });

  } catch (error) {
    console.error('Chat routing error:', error);
    next(error);
  }
});

export default router;
