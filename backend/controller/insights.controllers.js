const Groq = require("groq-sdk");
const AttentionSession = require("../models/Attentionsession.models");

let groq;

const getGroqClient = () => {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
};

const generateTeachingTips = async (req, res) => {
  try {
    const { sessionId } = req.body;

    const groqClient = getGroqClient();
    if (!groqClient) {
      return res
        .status(500)
        .json({ success: false, message: "GROQ_API_KEY missing in .env" });
    }

    const session = await AttentionSession.findById(sessionId);
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    const { metrics } = session;

    const prompt = `
        Analyze this student's attention data from a 1:1 teaching session and provide 3-4 concise, professional tips for the teacher to improve engagement.
        
        Session Metrics:
        - Average Attention: ${(metrics.averageAttention * 100).toFixed(1)}%
        - Attention Consistency: ${(metrics.consistencyScore * 100).toFixed(1)}%
        - Engagement Grade: ${metrics.engagementGrade}
        - Session Momentum: ${metrics.sessionMomentum > 0 ? "Improving" : "Declining"}
        - Longest distraction period: ${metrics.longestDistractionFrames} frames
        
        Provide the response in clear bullet points for the teacher. Focus on actionable pedagogical advice.
        `;

    const chatCompletion = await groqClient.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert pedagogical coach specialized in online 1:1 education.",
        },
        { role: "user", content: prompt },
      ],
      model: "groq/compound",
    });

    const tips =
      chatCompletion.choices[0]?.message?.content || "No tips generated.";

    res.json({ success: true, tips, metrics: session.metrics });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { generateTeachingTips };
