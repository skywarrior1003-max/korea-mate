const fs = require("fs");
const path = require("path");

const localInfoPath = path.join(__dirname, "../public/data/local-info.json");
const postsDir = path.join(__dirname, "../src/content/posts");

async function run() {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is missing.");
    process.exit(1);
  }

  // [1단계] 최신 데이터 확인
  let localData = [];
  try {
    const fileContent = fs.readFileSync(localInfoPath, "utf8");
    localData = JSON.parse(fileContent);
  } catch (err) {
    console.error("Error reading local-info.json:", err);
    process.exit(1);
  }

  if (localData.length === 0) {
    console.log("No data in local-info.json.");
    process.exit(0);
  }

  const latestItem = localData[localData.length - 1];

  // Check if already posted
  const existingFiles = fs.readdirSync(postsDir);
  const alreadyPosted = existingFiles.some((filename) => {
    const filePath = path.join(postsDir, filename);
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const nameMatch = content.match(/^title:\s*(.+)$/m);
      const itemName = latestItem.name ? latestItem.name.trim().toLowerCase() : "";
      if (nameMatch) {
        const title = nameMatch[1].trim().toLowerCase();
        if (title.includes(itemName) || itemName.includes(title)) return true;
      }
      return content.includes(latestItem.name);
    } catch {
      return false;
    }
  });

  if (alreadyPosted) {
    console.log("Already posted");
    process.exit(0);
  }

  // [2단계] Gemini AI로 블로그 글 생성
  const today = new Date().toISOString().split("T")[0];
  const prompt = `Write an English travel blog post for foreign travelers visiting Korea.
Based on this place/event data: ${JSON.stringify(latestItem, null, 2)}

Output format (use exactly this structure):
---
title: (engaging English title for foreign travelers)
date: ${today}
summary: (one sentence English summary)
category: Travel Guide
tags: [tag1, tag2, tag3]
---

(body: 800+ characters, friendly blog tone in English,
include 3 reasons why foreign travelers should visit,
include practical tips: how to get there, nearby transportation,
payment tips, solo traveler notes)

Last line must be:
FILENAME: YYYY-MM-DD-english-keyword`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

  console.log("Calling Gemini API to generate blog post...");
  let responseText;
  try {
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini API HTTP error: ${res.status}`);
    }

    const data = await res.json();
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini API");
    }
  } catch (err) {
    console.error("Error calling Gemini API:", err);
    process.exit(1);
  }

  // [3단계] 파일 저장
  try {
    const filenameMatch = responseText.match(/FILENAME:\s*(.+)$/m);
    if (!filenameMatch) {
      throw new Error("FILENAME not found in Gemini response");
    }

    const filename = filenameMatch[1].trim() + ".md";
    const postContent = responseText.replace(/\nFILENAME:.*$/m, "").trimEnd();
    const filePath = path.join(postsDir, filename);

    fs.writeFileSync(filePath, postContent, "utf8");
    console.log(`Successfully created blog post: ${filename}`);
  } catch (err) {
    console.error("Error saving blog post:", err);
    process.exit(1);
  }
}

run();
