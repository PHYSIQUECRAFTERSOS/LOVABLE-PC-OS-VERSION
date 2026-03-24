import { useEffect, useState } from "react";

interface XPToastProps {
  amount: number;
  onDone: () => void;
}

const XPToast = ({ amount, onDone }: XPToastProps) => {
  const [visible, setVisible] = useState(true);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDoneRef.current();
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const isGain = amount > 0;

  return (
    <>
      <style>{`
        @keyframes xpSlideUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        className="fixed bottom-24 left-1/2 z-[90]"
        style={{ animation: "xpSlideUp 0.3s ease-out" }}
      >
        <div
          className={`px-4 py-2 rounded-full text-sm font-bold shadow-lg ${
            isGain ? "bg-emerald-500/90 text-white" : "bg-red-500/90 text-white"
          }`}
        >
          {isGain ? "+" : ""}
          {amount} XP
        </div>
      </div>
    </>
  );
};

export default XPToast;
