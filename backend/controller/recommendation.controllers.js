const Material = require("../models/material.models");
const User = require("../models/user.models");
const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const getRecommendedContent = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user.interests || user.interests.length === 0) {
      // Return top purchased materials if no interests defined
      const defaultMaterials = await Material.find()
        .sort({ purchaseCount: -1 })
        .limit(6)
        .populate("teacherId", "name specialization");
      return res.json({
        success: true,
        recommendations: defaultMaterials,
        source: "popular",
      });
    }

    // 1. Fetch all materials (or a subset for performance)
    const allMaterials = await Material.find()
      .limit(30)
      .populate("teacherId", "name specialization");

    // 2. Prepare prompt for Groq
    const materialSummaries = allMaterials
      .map(
        (m) =>
          `ID: ${m._id}, Title: ${m.title}, Category: ${m.category}, Description: ${m.description.substring(0, 50)}...`,
      )
      .join("\n");

    const prompt = `
      User Profile:
      Interests: ${user.interests.join(", ")}
      Bio: ${user.bio}

      Available Educational Materials:
      ${materialSummaries}

      Task: Based on the user's interests, select the TOP 6 most relevant materials. 
      Return ONLY a JSON object with a key "recommendedIds" containing an array of the MongoDB IDs.
      Example: {"recommendedIds": ["id1", "id2"]}
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "openai/gpt-oss-120b",
      response_format: { type: "json_object" },
    });

    let content = chatCompletion.choices[0].message.content.trim();
    // Helper to strip markdown if LLM includes it
    if (content.startsWith("```json")) {
      content = content
        .replace(/^```json/, "")
        .replace(/```$/, "")
        .trim();
    }

    const responseContent = JSON.parse(content);
    const recommendedIds = responseContent.recommendedIds || [];

    // Map back to full material objects
    const recommendedMaterials = allMaterials.filter((m) =>
      recommendedIds.includes(m._id.toString()),
    );

    res.json({
      success: true,
      recommendations: recommendedMaterials,
      source: "ai_semantic",
    });
  } catch (error) {
    console.error("Recommendation Error:", error);
    // Fallback to popular content on error
    const fallback = await Material.find()
      .sort({ purchaseCount: -1 })
      .limit(6)
      .populate("teacherId", "name specialization");
    res.json({
      success: true,
      recommendations: fallback,
      source: "fallback_popular",
    });
  }
};

module.exports = {
  getRecommendedContent,
};
