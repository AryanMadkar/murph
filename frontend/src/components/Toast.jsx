import { useEffect, useState } from "react";
import { CheckCircle, AlertCircle, X, Info } from "lucide-react";

/**
 * Toast Component
 * A reusable toast notification that matches the Murph UI style.
 *
 * Props:
 * - message: The message to display
 * - type: "success" | "error" | "info"
 * - onClose: Callback when toast is dismissed
 * - duration: Auto-dismiss duration in ms (default: 4000)
 */
export default function Toast({ message, type = "info", onClose, duration = 4000 }) {
    const [isVisible, setIsVisible] = useState(true);
    const [isLeaving, setIsLeaving] = useState(false);

    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                handleClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration]);

    const handleClose = () => {
        setIsLeaving(true);
        setTimeout(() => {
            setIsVisible(false);
            onClose?.();
        }, 300);
    };

    if (!isVisible) return null;

    const styles = {
        success: {
            bg: "bg-green-50",
            border: "border-green-200",
            icon: <CheckCircle className="w-5 h-5 text-green-500" />,
            text: "text-green-800",
            subtext: "text-green-600",
        },
        error: {
            bg: "bg-red-50",
            border: "border-red-200",
            icon: <AlertCircle className="w-5 h-5 text-red-500" />,
            text: "text-red-800",
            subtext: "text-red-600",
        },
        info: {
            bg: "bg-blue-50",
            border: "border-blue-200",
            icon: <Info className="w-5 h-5 text-blue-500" />,
            text: "text-blue-800",
            subtext: "text-blue-600",
        },
    };

    const style = styles[type] || styles.info;

    return (
        <div
            className={`fixed top-6 right-6 z-[9999] max-w-sm w-full transform transition-all duration-300 ease-out ${isLeaving ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"
                }`}
        >
            <div
                className={`${style.bg} ${style.border} border rounded-2xl shadow-xl shadow-gray-200/50 p-4 flex items-start gap-3`}
            >
                <div className="flex-shrink-0 mt-0.5">{style.icon}</div>
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${style.text}`}>{message}</p>
                </div>
                <button
                    onClick={handleClose}
                    className="flex-shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
                >
                    <X className={`w-4 h-4 ${style.subtext}`} />
                </button>
            </div>
        </div>
    );
}
