import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

export default function TeacherUpload() {
    const navigate = useNavigate();
    const [uploadLoading, setUploadLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [materialForm, setMaterialForm] = useState({
        title: "",
        description: "",
        type: "video",
        price: "",
        category: "",
        tags: "",
    });
    const [selectedFile, setSelectedFile] = useState(null);

    // Get auth headers
    const getAuthHeaders = () => {
        const token = localStorage.getItem("token");
        return { Authorization: `Bearer ${token}` };
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!selectedFile) {
            setMessage("Please select a file to upload");
            return;
        }

        setUploadLoading(true);
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("title", materialForm.title);
        formData.append("description", materialForm.description);
        formData.append("type", materialForm.type);
        formData.append("price", materialForm.price * 100); // to paise
        formData.append("category", materialForm.category);
        formData.append("tags", materialForm.tags);

        try {
            const res = await axios.post(
                `${API_URL}/api/materials/upload`,
                formData,
                {
                    headers: {
                        ...getAuthHeaders(),
                        "Content-Type": "multipart/form-data",
                    },
                },
            );

            if (res.data.success) {
                setMessage("✅ Content uploaded successfully!");
                setMaterialForm({
                    title: "",
                    description: "",
                    type: "video",
                    price: "",
                    category: "",
                    tags: "",
                });
                setSelectedFile(null);
                // Redirect to dashboard after success
                setTimeout(() => navigate("/teacher-dashboard"), 1500);
            }
        } catch (err) {
            setMessage(
                "❌ Upload failed: " + (err.response?.data?.message || err.message),
            );
        } finally {
            setUploadLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                    Upload Content
                </h1>
                <p className="text-gray-500 mt-2 text-lg">
                    Share your educational materials with students
                </p>
            </div>

            {/* Notifications */}
            {message && (
                <div className="mb-8 p-4 bg-white border border-gray-100 shadow-sm rounded-xl flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${message.includes("✅") ? "bg-black" : "bg-gray-400"}`}></div>
                    <p className="font-medium text-gray-800">{message}</p>
                </div>
            )}

            {/* Upload Form */}
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden p-8">
                <form onSubmit={handleUpload} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                                Title
                            </label>
                            <input
                                type="text"
                                required
                                value={materialForm.title}
                                onChange={(e) =>
                                    setMaterialForm({
                                        ...materialForm,
                                        title: e.target.value,
                                    })
                                }
                                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-black focus:outline-none transition-all"
                                placeholder="Python for Beginners"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                                    Type
                                </label>
                                <select
                                    value={materialForm.type}
                                    onChange={(e) =>
                                        setMaterialForm({
                                            ...materialForm,
                                            type: e.target.value,
                                        })
                                    }
                                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-black focus:outline-none transition-all appearance-none"
                                >
                                    <option value="video">Video</option>
                                    <option value="document">Document</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                                    Price (USD)
                                </label>
                                <input
                                    type="number"
                                    required
                                    value={materialForm.price}
                                    onChange={(e) =>
                                        setMaterialForm({
                                            ...materialForm,
                                            price: e.target.value,
                                        })
                                    }
                                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-black focus:outline-none transition-all"
                                    placeholder="9.99"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                                    Category
                                </label>
                                <select
                                    required
                                    value={materialForm.category}
                                    onChange={(e) =>
                                        setMaterialForm({
                                            ...materialForm,
                                            category: e.target.value,
                                        })
                                    }
                                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-black focus:outline-none transition-all appearance-none"
                                >
                                    <option value="">Select</option>
                                    <option value="Programming">Programming</option>
                                    <option value="Math">Math</option>
                                    <option value="Science">Science</option>
                                    <option value="Design">Design</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                                    File
                                </label>
                                <input
                                    type="file"
                                    required
                                    onChange={(e) => setSelectedFile(e.target.files[0])}
                                    className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-gray-100 file:text-gray-500 hover:file:bg-gray-200"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                                Description
                            </label>
                            <textarea
                                required
                                rows={4}
                                value={materialForm.description}
                                onChange={(e) =>
                                    setMaterialForm({
                                        ...materialForm,
                                        description: e.target.value,
                                    })
                                }
                                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-black focus:outline-none transition-all resize-none"
                                placeholder="Detailed description..."
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={uploadLoading}
                        className="w-full py-5 bg-black hover:bg-gray-800 text-white font-bold rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 disabled:bg-gray-300 cursor-pointer"
                    >
                        {uploadLoading ? (
                            <Loader2 className="animate-spin h-5 w-5" />
                        ) : (
                            "Upload & Publish"
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
