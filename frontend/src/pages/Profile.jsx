import React, { useState } from "react";
import { motion } from "framer-motion";
import { User, Building, Briefcase, Save, Shield } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const researchDomains = [
  "Artificial Intelligence & Machine Learning",
  "Quantum Technology",
  "Hypersonics",
  "Cyber Security",
  "Space Technology",
  "Robotics & Autonomous Systems",
  "Semiconductors",
  "Biotechnology",
  "Energy Systems",
  "Communications & Networking",
  "Materials Science",
  "Directed Energy Weapons",
];

const Profile = () => {
  const { user, updateProfile } = useAuth();
  const [formData, setFormData] = useState({
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    organization: user?.organization || "",
    designation: user?.designation || "",
    research_domains: user?.research_domains || [],
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleDomainToggle = (domain) => {
    setFormData((prev) => ({
      ...prev,
      research_domains: prev.research_domains.includes(domain)
        ? prev.research_domains.filter((d) => d !== domain)
        : [...prev.research_domains, domain],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await updateProfile(formData);
      if (result.success) {
        toast.success("Profile updated successfully!");
      } else {
        toast.error(result.error.message || "Update failed");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center rounded-2xl bg-white/80 backdrop-blur-xl border border-white/40 shadow-md px-6 py-7">
        <div className="flex justify-center mb-3">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-tech-gradient flex items-center justify-center">
              <User className="w-10 h-10 text-white" />
            </div>
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-400 rounded-full border-2 border-white"></div>
          </div>
        </div>
        <h1 className="text-3xl md:text-4xl font-orbitron font-bold text-slate-900 tracking-tight mb-1">
          Profile Settings
        </h1>
        <p className="text-slate-600 text-lg">
          Manage your TechSentry account and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-8 items-start">
        {/* Profile Information */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="lg:col-span-2"
        >
          <div className="tech-card">
            <div className="flex items-center mb-6">
              <Shield className="w-5 h-5 text-tech-primary mr-2" />
              <h2 className="text-xl font-orbitron font-semibold text-tech-text">
                Personal Information
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-tech-text mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    className="tech-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-tech-text mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    className="tech-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-tech-text mb-2">
                  <Building className="inline w-4 h-4 mr-1" />
                  Organization
                </label>
                <input
                  type="text"
                  name="organization"
                  value={formData.organization}
                  onChange={handleChange}
                  className="tech-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tech-text mb-2">
                  <Briefcase className="inline w-4 h-4 mr-1" />
                  Designation
                </label>
                <input
                  type="text"
                  name="designation"
                  value={formData.designation}
                  onChange={handleChange}
                  className="tech-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tech-text mb-2">
                  Research Domains
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-3 border border-tech-border rounded-lg bg-tech-surface">
                  {researchDomains.map((domain) => (
                    <label
                      key={domain}
                      className="flex items-center space-x-2 cursor-pointer hover:bg-tech-border/50 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={formData.research_domains.includes(domain)}
                        onChange={() => handleDomainToggle(domain)}
                        className="w-4 h-4 text-tech-primary bg-tech-surface border-tech-border rounded focus:ring-tech-primary"
                      />
                      <span className="text-sm text-tech-text">{domain}</span>
                    </label>
                  ))}
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="tech-button-primary flex items-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </motion.button>
            </form>
          </div>
        </motion.div>

        {/* Account Status */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="space-y-6 lg:sticky lg:top-6"
        >
          <div className="tech-card">
            <h3 className="text-lg font-orbitron font-semibold text-tech-text mb-4">
              Account Status
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-tech-muted">Email</span>
                <span className="text-tech-text font-mono text-sm">
                  {user?.email}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-tech-muted">Verification</span>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded ${
                    user?.is_verified
                      ? "bg-tech-success/20 text-tech-success"
                      : "bg-tech-secondary/20 text-tech-secondary"
                  }`}
                >
                  {user?.is_verified ? "Verified" : "Pending"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-tech-muted">Member Since</span>
                <span className="text-tech-text font-mono text-sm">
                  {user?.date_joined
                    ? new Date(user.date_joined).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-tech-muted">Last Login</span>
                <span className="text-tech-text font-mono text-sm">
                  {user?.last_login
                    ? new Date(user.last_login).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>

          <div className="tech-card">
            <h3 className="text-lg font-orbitron font-semibold text-tech-text mb-4">
              Security Settings
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-tech-muted">Two-Factor Auth</span>
                <button className="text-tech-primary hover:text-tech-primary/80 text-sm">
                  Enable
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-tech-muted">Password</span>
                <button className="text-tech-primary hover:text-tech-primary/80 text-sm">
                  Change
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-tech-muted">API Access</span>
                <button className="text-tech-primary hover:text-tech-primary/80 text-sm">
                  Manage
                </button>
              </div>
            </div>
          </div>

          <div className="tech-card">
            <h3 className="text-lg font-orbitron font-semibold text-tech-text mb-4">
              Activity Summary
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-tech-muted">Searches</span>
                <span className="text-tech-text font-mono">247</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-tech-muted">Reports Generated</span>
                <span className="text-tech-text font-mono">18</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-tech-muted">Watchlist Items</span>
                <span className="text-tech-text font-mono">12</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Profile;
