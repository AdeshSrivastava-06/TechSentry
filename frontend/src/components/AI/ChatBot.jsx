import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

function renderInlineFormatting(text) {
  if (!text) return null;

  const parts = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={`bold-${match.index}`} style={{ color: "#F1F7FF" }}>
        {match[1]}
      </strong>,
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function renderMessageContent(content) {
  const raw = (content || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const lines = raw.split("\n");
  return lines.map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <div key={`space-${index}`} style={{ height: "6px" }} />;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const headingText = trimmed.replace(/^#{1,3}\s+/, "");
      return (
        <div
          key={`h-${index}`}
          style={{
            color: "#B9D9FF",
            fontWeight: 700,
            marginTop: "4px",
            marginBottom: "2px",
          }}
        >
          {renderInlineFormatting(headingText)}
        </div>
      );
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[-*]\s+/, "");
      return (
        <div key={`b-${index}`} style={{ display: "flex", gap: "8px" }}>
          <span style={{ color: "#6FB4FF" }}>•</span>
          <span>{renderInlineFormatting(bulletText)}</span>
        </div>
      );
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      return <div key={`n-${index}`}>{renderInlineFormatting(trimmed)}</div>;
    }

    return <div key={`p-${index}`}>{renderInlineFormatting(trimmed)}</div>;
  });
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Welcome to TechSentry AI. I can provide detailed technology intelligence with clear recommendations.\n\nTry asking:\n- Compare hypersonic glide vehicles vs cruise missiles for near-term deployment readiness\n- Estimate TRL and top risks for quantum radar\n- Build a 90-day validation plan for autonomous swarm systems",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [panelSize, setPanelSize] = useState({ width: 410, height: 530 });
  const [isResizing, setIsResizing] = useState(false);
  const bottomRef = useRef(null);
  const resizeStateRef = useRef(null);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event) => {
      if (!resizeStateRef.current) return;

      const { startX, startY, startWidth, startHeight } =
        resizeStateRef.current;

      // Panel is anchored to bottom-right, so dragging left/up should enlarge it.
      const deltaX = startX - event.clientX;
      const deltaY = startY - event.clientY;

      const minWidth = 360;
      const minHeight = 460;
      const maxWidth = Math.max(minWidth, window.innerWidth - 40);
      const maxHeight = Math.max(minHeight, window.innerHeight - 120);

      setPanelSize({
        width: clamp(startWidth + deltaX, minWidth, maxWidth),
        height: clamp(startHeight + deltaY, minHeight, maxHeight),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const handleResizeStart = (event) => {
    event.preventDefault();
    resizeStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: panelSize.width,
      startHeight: panelSize.height,
    };
    setIsResizing(true);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMessage = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(
        "/api/chat/",
        {
          messages: updatedMessages.filter((m) => m.role !== "system"),
        },
        {
          timeout: 45000,
        },
      );
      const assistantText =
        res?.data?.response ||
        res?.data?.message ||
        "I could not generate a response. Please try again.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantText },
      ]);

      if (res?.data?.error) {
        setError(`Service notice: ${res.data.error}`);
      }
    } catch (err) {
      const errMsg =
        err.code === "ECONNABORTED"
          ? "Request timed out. Please try again."
          : err.response?.data?.error ||
            "Connection failed. Check backend server and HF_API_KEY (or HUGGINGFACE_API_KEY).";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 1000,
          width: "64px",
          height: "64px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "-4px",
            borderRadius: "50%",
            border: "2px solid rgba(111, 180, 255, 0.75)",
            boxShadow: "0 0 16px rgba(74, 144, 226, 0.55)",
          }}
        />
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close chatbot" : "Open chatbot"}
          title={isOpen ? "Close AI chat" : "Open AI chat"}
          style={{
            position: "absolute",
            inset: 0,
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 30% 30%, #4FA9F5, #1B4B82 68%)",
            border: "2px solid #B8DEFF",
            color: "white",
            fontSize: "26px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow:
              "0 8px 20px rgba(34, 109, 170, 0.75), 0 0 14px rgba(111, 180, 255, 0.5)",
          }}
        >
          {isOpen ? "X" : "💬"}
        </button>
        {!isOpen && (
          <div
            style={{
              position: "absolute",
              top: "-7px",
              right: "-9px",
              background: "#FFB547",
              color: "#0A1628",
              border: "1px solid #FFD089",
              borderRadius: "999px",
              padding: "1px 6px",
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: "0.4px",
            }}
          >
            AI
          </div>
        )}
      </div>

      {/* Chat Panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "90px",
            right: "24px",
            width: `${panelSize.width}px`,
            height: `${panelSize.height}px`,
            background: "#0D1B2A",
            border: "1px solid #2E86AB",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            zIndex: 999,
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px",
              borderBottom: "1px solid #1B4B82",
              background: "#0A1628",
              borderRadius: "12px 12px 0 0",
            }}
          >
            <div
              style={{ color: "#2E86AB", fontWeight: "bold", fontSize: "14px" }}
            >
              🛡️ TechSentry AI
            </div>
            <div style={{ color: "#6B8CAE", fontSize: "11px" }}>
              Defence Technology Intelligence Assistant
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: msg.role === "user" ? "#1B4B82" : "#111D2E",
                  border: `1px solid ${msg.role === "user" ? "#2E86AB" : "#1B3A5C"}`,
                  borderRadius: "8px",
                  padding: "10px 12px",
                  color: "#E0EAF4",
                  fontSize: "13px",
                  lineHeight: "1.5",
                }}
              >
                {msg.role === "assistant"
                  ? renderMessageContent(msg.content)
                  : msg.content}
              </div>
            ))}
            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  color: "#6B8CAE",
                  fontSize: "13px",
                  padding: "8px",
                }}
              >
                Analyzing...
              </div>
            )}
            {error && (
              <div
                style={{
                  color: "#FF6B6B",
                  fontSize: "12px",
                  background: "#2D0A0A",
                  padding: "8px",
                  borderRadius: "6px",
                }}
              >
                Error: {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "12px",
              borderTop: "1px solid #1B4B82",
              display: "flex",
              gap: "8px",
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about any technology..."
              style={{
                flex: 1,
                background: "#0A1628",
                border: "1px solid #2E86AB",
                borderRadius: "6px",
                padding: "8px 12px",
                color: "#E0EAF4",
                fontSize: "13px",
                outline: "none",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{
                background: "#1B4B82",
                border: "1px solid #2E86AB",
                borderRadius: "6px",
                padding: "8px 14px",
                color: "white",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                opacity: loading || !input.trim() ? 0.65 : 1,
                fontSize: "13px",
              }}
            >
              Send
            </button>
          </div>

          <div
            onMouseDown={handleResizeStart}
            title="Resize chat window"
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: "24px",
              height: "24px",
              cursor: "nwse-resize",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              padding: "4px",
              background:
                "linear-gradient(135deg, transparent 0%, transparent 45%, #2E86AB 45%, #2E86AB 55%, transparent 55%, transparent 100%)",
              borderBottomRightRadius: "12px",
            }}
          />
        </div>
      )}
    </>
  );
}
