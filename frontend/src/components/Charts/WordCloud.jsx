import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

const WordCloud = ({ words, title = "Technology Keywords" }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !words || words.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const container = containerRef.current;

    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const processedWords = words
      .map((word, index) => ({
        text: word.text || word.word || "",
        value: Number(word.value || word.frequency || word.size || 1),
        seed: index,
      }))
      .filter((word) => word.text && word.text.length > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 80);

    if (processedWords.length === 0) return;

    const maxValue = Math.max(...processedWords.map((w) => w.value));
    const minValue = Math.min(...processedWords.map((w) => w.value));

    // Stronger scaling so high-density terms are clearly larger.
    const getFontSize = (value, rank) => {
      if (maxValue === minValue) {
        return Math.max(14, 58 - rank * 1.1);
      }

      const normalized = (value - minValue) / (maxValue - minValue);
      const boosted = Math.pow(normalized, 0.45);
      return 12 + boosted * 64;
    };

    // Balanced professional palette with high contrast on light backgrounds.
    const colors = [
      "#1D4ED8",
      "#0F766E",
      "#9333EA",
      "#B45309",
      "#BE123C",
      "#0F172A",
      "#0C4A6E",
      "#3F6212",
    ];

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const placedBoxes = [];

    const intersects = (a, b) => {
      return !(
        a.x + a.w < b.x ||
        b.x + b.w < a.x ||
        a.y + a.h < b.y ||
        b.y + b.h < a.y
      );
    };

    processedWords.forEach((word, index) => {
      const fontSize = getFontSize(word.value, index);
      const color = colors[index % colors.length];
      const rotation =
        Math.random() < 0.28 ? (Math.random() < 0.5 ? -0.2 : 0.2) : 0;
      ctx.font = `700 ${fontSize}px 'Rajdhani', 'IBM Plex Sans', sans-serif`;

      const textWidth = ctx.measureText(word.text).width;
      const textHeight = fontSize;
      const pad = 3;

      let placed = false;
      let x = centerX;
      let y = centerY;

      for (let step = 0; step < 1200; step += 1) {
        const t = step * 0.37;
        const radius = 0.9 * t;
        x = centerX + radius * Math.cos(t);
        y = centerY + radius * Math.sin(t);

        const box = {
          x: x - textWidth / 2 - pad,
          y: y - textHeight / 2 - pad,
          w: textWidth + pad * 2,
          h: textHeight + pad * 2,
        };

        if (
          box.x < 0 ||
          box.y < 0 ||
          box.x + box.w > canvas.width ||
          box.y + box.h > canvas.height
        ) {
          continue;
        }

        const hasCollision = placedBoxes.some((existing) =>
          intersects(existing, box),
        );
        if (!hasCollision) {
          placedBoxes.push(box);
          placed = true;
          break;
        }
      }

      if (!placed) return;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);

      ctx.font = `700 ${fontSize}px 'Rajdhani', 'IBM Plex Sans', sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.shadowColor = "rgba(15, 23, 42, 0.22)";
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      ctx.fillText(word.text, 0, 0);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.strokeText(word.text, 0, 0);

      ctx.restore();
    });
  }, [words]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/70 backdrop-blur-xl rounded-xl shadow-lg border border-white/20 p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      <div
        ref={containerRef}
        className="relative bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.14),transparent_36%),radial-gradient(circle_at_80%_85%,rgba(20,184,166,0.13),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)] rounded-lg p-4"
        style={{ height: "350px" }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: "block" }}
        />
        {!words ||
          (words.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-gray-500 text-sm">No keywords available</p>
            </div>
          ))}
      </div>
      {words && words.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {words.slice(0, 8).map((word, index) => (
            <span
              key={index}
              className="px-3 py-1 text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full"
            >
              {word.text || word.word}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default WordCloud;
