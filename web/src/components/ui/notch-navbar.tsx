import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, Menu, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "../../lib/utils"

// Notch navbar — full-width bar with a center notch that dips down and
// carries the brand. Adapted from VengeanceUI (Next.js) to this project:
// react-router links, motion/react, Vice City dark palette, no theme toggle
// (the app is light-only with a fixed dark navbar).

const NavLink = ({
  to,
  icon: Icon,
  label,
}: {
  to: string
  icon?: React.ComponentType<{ className?: string }>
  label: string
}) => (
  <Link
    to={to}
    className="group flex items-center gap-1.5 text-sm font-medium text-white/70 transition-colors whitespace-nowrap hover:text-white"
  >
    {Icon ? <Icon className="w-4 h-4 opacity-70 group-hover:opacity-100" /> : null}
    <span>{label}</span>
  </Link>
)

export function NotchNavbar({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const items: {
    left: { label: string; to: string; icon?: React.ComponentType<{ className?: string }> }[]
    right: { label: string; to: string; icon?: React.ComponentType<{ className?: string }> }[]
  } = {
    left: [{ label: "How It Works", to: "#how-it-works" }],
    right: [{ label: "Start Learning", to: "/upload", icon: ArrowUpRight }],
  }

  return (
    <>
      <header className={cn("fixed top-0 inset-x-0 z-50 h-16 flex", className)} {...props}>
        {/* Left Side Bar - Flexible width */}
        <div className="flex-1 h-10 bg-[#E61E32] text-white z-20 relative min-w-0">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <line x1="0" y1="39.5" x2="100%" y2="39.5" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-white" />
            <line x1="0" y1="36.5" x2="100%" y2="36.5" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-white" />
          </svg>
        </div>

        {/* Responsive Notch Container - 3 Slices */}
        <div className="flex h-16 relative z-10 shrink-0 -ml-px">
          {/* Left Slice (Corner) */}
          <div className="w-[50px] h-full relative shrink-0">
            <div className="absolute inset-0 bg-[#E61E32] text-white rounded-bl-xl" style={{ clipPath: "path('M0 0 H50 V64 C25 64 25 40 Z')" }} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 50 64">
              <path d="M0 39.5 C25 25 63.5 50" fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-white" />
              <path d="M0 36.5 C25 25 60.5 50" fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-white" />
            </svg>
          </div>

          {/* Center Slice (Flexible Content Area) */}
          <div className="flex-1 h-full relative min-w-0 -ml-px">
            <div className="absolute inset-0 bg-[#E61E32] text-white">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                <line x1="0" y1="63.5" x2="100%" y2="63.5" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-white" />
                <line x1="0" y1="60.5" x2="100%" y2="60.5" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-white" />
              </svg>
            </div>

            <div className="relative w-full h-full flex items-end justify-between pb-2 px-4 md:px-8">
              {/* Desktop Left Nav */}
              <nav className="hidden md:flex gap-8 mb-1 shrink-0">
                {items.left.map((item) => (
                  <NavLink key={item.label} {...item} />
                ))}
              </nav>

              {/* Mobile Menu Button (Left) */}
              <button
                className="md:hidden mb-1 p-1 text-white/70 transition-colors hover:text-white"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Logo (Center) */}
              <div className="flex justify-center shrink-0 mx-2 md:mx-4 mt-1">
                <Link to="/" className="flex items-center justify-center relative group" aria-label="Orabl home">
                  <span className="font-sans text-lg font-extrabold tracking-[-0.06em] text-white transition-colors group-hover:text-white">
                    Orabl<span className="text-white">.</span>
                  </span>
                </Link>
              </div>

              {/* Desktop Right Nav */}
              <nav className="hidden md:flex gap-6 items-center shrink-0">
                {items.right.map((item) => (
                  <NavLink key={item.label} {...item} />
                ))}
              </nav>

              {/* Mobile Right Actions */}
              <div className="md:hidden flex items-center gap-2 mb-1" />
            </div>
          </div>

          {/* Right Slice (Corner) */}
          <div className="w-[50px] h-full relative shrink-0 -ml-px">
            <div className="absolute inset-0 bg-[#E61E32] rounded-br-xl" style={{ clipPath: "path('M0 0 H50 V40 C25 40 25 64 Z')" }} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 50 64">
              <path d="M0 63.5 C25 25 39.5 50" fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-white" />
              <path d="M0 60.5 C25 25 36.5 50" fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-white" />
            </svg>
          </div>
        </div>

        {/* Right Side Bar - Flexible width */}
        <div className="flex-1 h-10 bg-[#E61E32] z-20 relative min-w-0 -ml-px">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <line x1="0" y1="39.5" x2="100%" y2="39.5" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-white" />
            <line x1="0" y1="36.5" x2="100%" y2="36.5" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-white" />
          </svg>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-16 z-40 border-b border-white/15 bg-[#E61E32] p-4 md:hidden shadow-lg"
          >
            <nav className="flex flex-col gap-2">
              {[...items.left, ...items.right].map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="flex items-center gap-3 p-3 rounded-lg text-white transition-colors hover:bg-white/10"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.icon ? <item.icon className="w-5 h-5 opacity-70" /> : null}
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
