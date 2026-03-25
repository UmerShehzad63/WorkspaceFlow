import { motion } from "motion/react";
import { Bolt, ArrowRight, Verified, Star, CheckCircle2, Terminal, Sparkles, ShieldCheck, Clock, Coffee, XCircle, Check, Search, Plus, Pencil, FileText, Calendar as CalendarIcon, Mail, HardDrive, Archive, Users } from "lucide-react";
import { useState, useEffect } from "react";

const Navbar = () => (
  <nav className="fixed top-0 w-full z-50 glass-header border-b border-primary/5">
    <div className="flex justify-between items-center w-full px-8 py-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 text-xl font-extrabold text-primary font-headline">
        <Bolt className="text-secondary fill-secondary" size={24} />
        CouchMail
      </div>
      <div className="hidden md:flex items-center gap-8">
        <a className="text-primary font-bold border-b-2 border-secondary text-sm" href="#features">Features</a>
        <a className="text-primary/70 hover:text-secondary transition-colors duration-300 text-sm" href="#comparison">Comparison</a>
        <a className="text-primary/70 hover:text-secondary transition-colors duration-300 text-sm" href="#pricing">Pricing</a>
        <a className="text-primary/70 hover:text-secondary transition-colors duration-300 text-sm" href="#about">About</a>
      </div>
      <div className="flex items-center gap-4">
        <button className="text-primary font-bold text-sm hidden sm:block">Sign In</button>
        <button className="bg-secondary text-white px-6 py-2 rounded-full font-bold text-sm midnight-shadow hover:scale-[0.98] transition-all">
          Get Started
        </button>
      </div>
    </div>
  </nav>
);

const Hero = () => {
  const [text, setText] = useState("on autopilot.");
  const phrases = ["on autopilot.", "while you sleep.", "before you wake.", "handled."];
  
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % phrases.length;
      setText(phrases[i]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="max-w-7xl mx-auto px-8 py-20 lg:py-32 grid lg:grid-cols-2 gap-16 items-center">
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="space-y-8"
      >
        <div className="inline-flex items-center gap-2 bg-primary/5 px-4 py-2 rounded-lg border border-primary/5">
          <Verified className="text-secondary" size={16} />
          <span className="font-label text-xs tracking-widest uppercase text-primary">Powered by Google Workspace MCP</span>
        </div>
        <h1 className="text-5xl lg:text-7xl font-headline font-extrabold text-primary leading-[1.1] tracking-tight">
          Your Google Workspace, <br/>
          <span className="text-secondary">{text}</span>
        </h1>
        <p className="text-xl text-on-surface-variant max-w-xl leading-relaxed">
          AI-powered daily briefings that synthesize your emails, docs, and calendar into a single, actionable morning dossier. Handle your day before it handles you.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <button className="bg-secondary text-white px-8 py-4 rounded-full font-bold text-lg midnight-shadow flex items-center gap-2 group">
            Start Free 3-Day Trial
            <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
          </button>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9, rotate: 5 }}
        animate={{ opacity: 1, scale: 1, rotate: 2 }}
        whileHover={{ rotate: 0 }}
        transition={{ duration: 0.8, ease: [0.2, 0, 0, 1] }}
        className="relative"
      >
        <div className="absolute -inset-4 bg-secondary/5 rounded-3xl blur-3xl"></div>
        <div className="relative bg-primary rounded-xl overflow-hidden midnight-shadow border border-white/10">
          <div className="bg-primary/50 px-4 py-3 flex items-center justify-between border-b border-white/5 backdrop-blur-md">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
            </div>
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Morning Briefing — June 16</span>
            <div className="w-10"></div>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <h3 className="font-headline text-white text-lg">Today's Schedule</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-4 bg-white/5 p-3 rounded-lg border border-white/10">
                  <span className="font-mono text-xs text-secondary/70">09:00 AM</span>
                  <div className="flex-1">
                    <p className="text-white text-sm font-semibold">Client Kickoff: Zenith Corp</p>
                    <p className="text-white/40 text-xs">Strategy Session & Timeline Review</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 bg-white/5 p-3 rounded-lg border border-white/10">
                  <span className="font-mono text-xs text-secondary/70">02:00 PM</span>
                  <div className="flex-1">
                    <p className="text-white text-sm font-semibold">1:1 with Design Lead</p>
                    <p className="text-white/40 text-xs">Product Roadmap Sync</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-white/10 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-headline text-white text-lg">Inbox Intelligence</h3>
                <span className="bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded text-[10px] font-mono border border-amber-500/30 uppercase">2 Likely Urgent</span>
              </div>
              <p className="text-white/60 text-sm leading-relaxed">
                You have 12 unread threads. <span className="text-white">Sarah</span> confirmed the contract terms, and there's a billing notification from <span className="text-white">Stripe</span> that requires attention before EOD.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
};

const SocialProof = () => (
  <section className="bg-surface-container/50 py-16">
    <div className="max-w-7xl mx-auto px-8 flex flex-wrap justify-between items-center gap-12">
      <div className="flex flex-col">
        <span className="font-mono text-[10px] uppercase tracking-tighter text-secondary mb-1">Ecosystem Growth</span>
        <span className="font-headline text-3xl font-bold text-primary">1,000+ Users</span>
      </div>
      <div className="flex items-center gap-12 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
        <div className="flex items-center gap-2 font-headline font-bold text-primary text-xl">
          <ShieldCheck size={24} /> TrustPilot
        </div>
        <div className="flex items-center gap-2 font-headline font-bold text-primary text-xl">
          <Clock size={24} /> ProductHunt
        </div>
        <div className="flex items-center gap-2">
          <Star className="text-amber-500 fill-amber-500" size={20} />
          <span className="font-headline font-bold text-primary">4.9/5 Rating</span>
        </div>
      </div>
    </div>
  </section>
);

const Features = () => (
  <section className="max-w-7xl mx-auto px-8 py-24" id="features">
    <div className="mb-16">
      <h2 className="text-4xl lg:text-5xl font-headline font-extrabold text-primary">
        Three ways to <span className="text-secondary">reclaim your time</span>
      </h2>
    </div>
    <div className="grid md:grid-cols-3 gap-8">
      {[
        {
          icon: <Sparkles className="text-secondary" size={32} />,
          tag: "MVP",
          title: "Morning Briefing",
          desc: "A curated digest of your day delivered at your chosen hour. No noise, just the essentials.",
          items: ["AI-synthesized email threads", "Calendar collision detection"]
        },
        {
          icon: <Terminal className="text-secondary" size={32} />,
          tag: "V1.1",
          title: "Command Bar",
          desc: "Natural language actions for your workspace. \"Draft a polite decline for the meeting tomorrow.\"",
          items: ["Cross-app task creation", "Instant file search"]
        },
        {
          icon: <Bolt className="text-secondary" size={32} />,
          tag: "V1.2",
          title: "Automated Rules",
          desc: "Intelligent filters that sort, archive, or highlight based on context, not just keywords.",
          items: ["Context-aware filtering", "Sentiment prioritization"]
        }
      ].map((f, i) => (
        <motion.div 
          key={i}
          whileHover={{ y: -8 }}
          className="bg-white p-8 rounded-lg border-l-4 border-secondary midnight-shadow flex flex-col justify-between"
        >
          <div>
            <div className="flex justify-between items-start mb-6">
              {f.icon}
              <span className="bg-secondary/10 text-secondary text-[10px] font-mono px-2 py-1 rounded">{f.tag}</span>
            </div>
            <h3 className="font-headline text-xl text-primary mb-4">{f.title}</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-6">{f.desc}</p>
            <ul className="space-y-3">
              {f.items.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm text-primary/80">
                  <CheckCircle2 className="text-secondary" size={14} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      ))}
    </div>
  </section>
);

const HowItWorks = () => (
  <section className="bg-primary py-24 overflow-hidden" id="how-it-works">
    <div className="max-w-7xl mx-auto px-8">
      <h2 className="text-4xl lg:text-5xl font-headline font-extrabold text-white mb-20 text-center">
        Up and running in under 60 seconds
      </h2>
      <div className="grid md:grid-cols-3 gap-12 relative">
        <div className="hidden md:block absolute top-20 left-[15%] right-[15%] h-0.5 border-t border-dashed border-secondary/40 z-0"></div>
        {[
          { num: "1", title: "Connect Google", desc: "Secure OAuth login. We never see your password, and data is encrypted end-to-end." },
          { num: "2", title: "Pick Your Time", desc: "Choose when you want your daily briefing delivered. We recommend 30 minutes before your first meeting." },
          { num: "3", title: "Relax", desc: "Close your laptop. CouchMail handles the noise and brings you the signal when you're ready." }
        ].map((s, i) => (
          <div key={i} className="relative z-10 text-center space-y-4">
            <div className="text-[80px] font-headline font-extrabold text-secondary/20 leading-none mb-4">{s.num}</div>
            <h3 className="text-xl font-headline text-white">{s.title}</h3>
            <p className="text-white/60 text-sm">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Comparison = () => (
  <section className="bg-surface-container/30 py-24" id="comparison">
    <div className="max-w-7xl mx-auto px-8">
      <div className="text-center mb-16 space-y-4">
        <h2 className="text-4xl font-headline font-extrabold text-primary">How we compare</h2>
        <p className="text-on-surface-variant max-w-2xl mx-auto">Traditional automation tools require engineering. We require a coffee break.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left">
              <th className="p-6 font-headline text-primary">Feature</th>
              <th className="p-6 font-headline text-primary bg-secondary/10 rounded-t-xl text-center">CouchMail</th>
              <th className="p-6 font-headline text-primary/40 text-center">Zapier / Make</th>
              <th className="p-6 font-headline text-primary/40 text-center">Google Native</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {[
              { name: "Natural Language Actions", couch: true, zapier: false, google: false },
              { name: "Setup Time", couch: "< 1 min", zapier: "Hours", google: "N/A" },
              { name: "AI Briefings", couch: true, zapier: false, google: false },
              { name: "Monthly Cost", couch: "$9/mo", zapier: "$29/mo+", google: "$0" }
            ].map((row, i) => (
              <tr key={i} className="border-b border-primary/5">
                <td className="p-6 text-primary font-semibold">{row.name}</td>
                <td className={`p-6 bg-secondary/10 text-center font-mono ${i === 3 ? 'rounded-b-xl font-bold text-secondary' : 'text-secondary'}`}>
                  {typeof row.couch === 'boolean' ? <CheckCircle2 className="mx-auto" size={20} /> : row.couch}
                </td>
                <td className="p-6 text-center font-mono text-primary/40">
                  {typeof row.zapier === 'boolean' ? <XCircle className="mx-auto text-red-400" size={20} /> : row.zapier}
                </td>
                <td className="p-6 text-center font-mono text-primary/40">
                  {typeof row.google === 'boolean' ? <XCircle className="mx-auto text-red-400" size={20} /> : row.google}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>
);

const Pricing = () => (
  <section className="bg-primary py-24" id="pricing">
    <div className="max-w-7xl mx-auto px-8">
      <div className="text-center mb-16 space-y-4">
        <h2 className="text-4xl font-headline font-extrabold text-white">Simple, transparent pricing</h2>
        <p className="text-white/60">Start with a free 3-day Pro trial. No credit card required.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-8 items-center">
        <div className="bg-white/5 p-8 rounded-lg border border-white/10 flex flex-col h-full">
          <h3 className="font-headline text-white text-xl mb-2">Free</h3>
          <div className="text-3xl font-headline text-white mb-6">$0<span className="text-sm font-normal text-white/40">/mo</span></div>
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-center gap-2 text-white/60 text-sm"><Check size={14} className="text-white/40" /> Basic daily summary</li>
            <li className="flex items-center gap-2 text-white/60 text-sm"><Check size={14} className="text-white/40" /> 1 Gmail account</li>
          </ul>
          <button className="w-full py-3 rounded-lg border border-white/20 text-white font-bold hover:bg-white/5 transition-colors">Start Free</button>
        </div>

        <div className="bg-white p-10 rounded-lg border-2 border-secondary midnight-shadow flex flex-col h-full relative transform scale-105 z-10">
          <div className="absolute top-0 right-0 bg-secondary text-white text-[10px] font-mono px-4 py-1 rounded-bl-lg uppercase tracking-widest">Most Popular</div>
          <h3 className="font-headline text-primary text-xl mb-2">Pro</h3>
          <div className="text-4xl font-headline text-primary mb-6">$9<span className="text-sm font-normal text-primary/40">/mo</span></div>
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-center gap-2 text-primary/80 text-sm font-semibold"><Check size={14} className="text-secondary" /> Advanced AI dossiers</li>
            <li className="flex items-center gap-2 text-primary/80 text-sm font-semibold"><Check size={14} className="text-secondary" /> Priority notifications</li>
            <li className="flex items-center gap-2 text-primary/80 text-sm font-semibold"><Check size={14} className="text-secondary" /> Up to 3 accounts</li>
            <li className="flex items-center gap-2 text-primary/80 text-sm font-semibold"><Check size={14} className="text-secondary" /> Command bar access</li>
          </ul>
          <button className="w-full py-4 rounded-lg bg-secondary text-white font-bold midnight-shadow hover:scale-[0.98] transition-all">Start Trial</button>
        </div>

        <div className="bg-white/5 p-8 rounded-lg border border-white/10 flex flex-col h-full">
          <h3 className="font-headline text-white text-xl mb-2">Pro Plus</h3>
          <div className="text-3xl font-headline text-white mb-6">$19<span className="text-sm font-normal text-white/40">/mo</span></div>
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-center gap-2 text-white/60 text-sm"><Check size={14} className="text-white/40" /> Team collaboration</li>
            <li className="flex items-center gap-2 text-white/60 text-sm"><Check size={14} className="text-white/40" /> 10+ accounts</li>
            <li className="flex items-center gap-2 text-white/60 text-sm"><Check size={14} className="text-white/40" /> Custom AI models</li>
          </ul>
          <button className="w-full py-3 rounded-lg border border-white/20 text-white font-bold hover:bg-white/5 transition-colors">Contact Sales</button>
        </div>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="bg-primary py-20 px-8 border-t border-white/5">
    <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 mb-20">
      <div className="space-y-6">
        <div className="text-lg font-bold text-white flex items-center gap-2 font-headline">
          <Bolt className="text-secondary fill-secondary" size={20} />
          CouchMail
        </div>
        <p className="text-white/40 text-xs leading-relaxed max-w-xs">Intelligence for the modern workspace. Handled with care, delivered with precision.</p>
      </div>
      {[
        { title: "Product", links: ["Features", "Integrations", "Pricing"] },
        { title: "Company", links: ["About Us", "Careers", "Security"] },
        { title: "Legal", links: ["Privacy Policy", "Terms of Service"] }
      ].map((col, i) => (
        <div key={i} className="space-y-4">
          <h4 className="font-label text-[10px] uppercase tracking-widest text-secondary font-bold">{col.title}</h4>
          <ul className="space-y-3">
            {col.links.map((link, idx) => (
              <li key={idx}><a className="text-white/60 hover:text-white transition-all text-sm" href="#">{link}</a></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    <div className="max-w-7xl mx-auto pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
      <span className="font-label text-[10px] text-white/40">© 2024 CouchMail Intelligence. All rights reserved.</span>
      <div className="flex gap-6">
        <a className="text-white/40 hover:text-secondary transition-all" href="#"><ShieldCheck size={18} /></a>
        <a className="text-white/40 hover:text-secondary transition-all" href="#"><Coffee size={18} /></a>
      </div>
    </div>
  </footer>
);

const Integrations = () => (
  <section className="max-w-7xl mx-auto px-8 py-24" id="integrations">
    <div className="flex justify-between items-end mb-12">
      <h2 className="text-3xl font-headline font-extrabold text-primary tracking-tight">Integrate All Core Services</h2>
      <a href="#" className="text-sm font-bold text-primary/60 hover:text-secondary transition-colors">All Services</a>
    </div>
    <div className="grid md:grid-cols-3 gap-[16px] items-stretch">
      {/* Gmail Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="border-[1.5px] border-[#E8A09A] bg-[#FDF6F5] rounded-[12px] p-[20px] flex flex-col midnight-shadow"
      >
        <div className="flex justify-between items-center flex-nowrap gap-[12px]">
          <div className="flex items-center gap-[10px] shrink-0">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1.5 5.25V18.75C1.5 19.58 2.17 20.25 3 20.25H5.25V8.25L12 13.5L18.75 8.25V20.25H21C21.83 20.25 22.5 19.58 22.5 18.75V5.25C22.5 4.42 21.83 3.75 21 3.75H18.75L12 9L5.25 3.75H3C2.17 3.75 1.5 4.42 1.5 5.25Z" fill="#EA4335"/>
              <path d="M1.5 5.25V18.75C1.5 19.58 2.17 20.25 3 20.25H5.25V8.25L1.5 5.25Z" fill="#C5221F"/>
              <path d="M22.5 5.25V18.75C22.5 19.58 21.83 20.25 21 20.25H18.75V8.25L22.5 5.25Z" fill="#C5221F"/>
              <path d="M12 13.5L1.5 5.25H5.25L12 10.5L18.75 5.25H22.5L12 13.5Z" fill="#EA4335"/>
            </svg>
            <span className="text-xl font-headline font-extrabold text-[#1B2F6E]">Gmail</span>
          </div>
          <button className="px-[14px] text-[13px] font-medium rounded-[8px] h-[34px] bg-[#4A7BC4] text-white border-none whitespace-nowrap shrink-0 flex items-center justify-center">
            <Pencil size={14} className="mr-1.5" /> Compose
          </button>
        </div>
        <div className="border-none border-t border-[rgba(27,47,110,0.10)] my-[14px]"></div>
        <ul className="flex-1 space-y-0">
          <li className="flex items-center gap-[10px] px-[4px] py-[6px] text-[14px] font-normal text-[#1B2F6E] rounded-[6px] cursor-pointer hover:bg-[rgba(108,92,231,0.06)] transition-colors">
            <Search size={16} className="shrink-0 text-[#EA4335]" /> Search & fetch emails
          </li>
          <li className="flex items-center gap-[10px] px-[4px] py-[6px] text-[14px] font-normal text-[#1B2F6E] rounded-[6px] cursor-pointer hover:bg-[rgba(108,92,231,0.06)] transition-colors">
            <Pencil size={16} className="shrink-0 text-[#EA4335]" /> Send & reply
          </li>
          <li className="flex items-center gap-[10px] px-[4px] py-[6px] text-[14px] font-normal text-[#1B2F6E] rounded-[6px] cursor-pointer hover:bg-[rgba(108,92,231,0.06)] transition-colors">
            <Archive size={16} className="shrink-0 text-[#EA4335]" /> Archive by sender/subject
          </li>
        </ul>
      </motion.div>

      {/* Calendar Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 }}
        className="border-[1.5px] border-[#93B8E8] bg-[#F3F7FD] rounded-[12px] p-[20px] flex flex-col midnight-shadow"
      >
        <div className="flex justify-between items-center flex-nowrap gap-[12px]">
          <div className="flex items-center gap-[10px] shrink-0">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1.5" y="3" width="21" height="19.5" rx="3" fill="white"/>
              <path d="M1.5 4.5C1.5 3.67 2.17 3 3 3H21C21.83 3 22.5 3.67 22.5 4.5V9H1.5V4.5Z" fill="#4285F4"/>
              <rect x="5.5" y="12" width="2" height="2" rx="0.5" fill="#4285F4"/>
              <rect x="11" y="12" width="2" height="2" rx="0.5" fill="#4285F4"/>
              <rect x="16.5" y="12" width="2" height="2" rx="0.5" fill="#4285F4"/>
              <rect x="5.5" y="16.5" width="2" height="2" rx="0.5" fill="#4285F4"/>
              <rect x="11" y="16.5" width="2" height="2" rx="0.5" fill="#4285F4"/>
              <rect x="16.5" y="16.5" width="2" height="2" rx="0.5" fill="#4285F4"/>
            </svg>
            <span className="text-xl font-headline font-extrabold text-[#1B2F6E]">Calendar</span>
          </div>
          <button className="px-[14px] text-[13px] font-medium rounded-[8px] h-[34px] bg-[#4A7BC4] text-white border-none whitespace-nowrap shrink-0 flex items-center justify-center">
            <Plus size={14} className="mr-1.5" /> New Event
          </button>
        </div>
        <div className="border-none border-t border-[rgba(27,47,110,0.10)] my-[14px]"></div>
        <ul className="flex-1 space-y-0">
          <li className="flex items-center gap-[10px] px-[4px] py-[6px] text-[14px] font-normal text-[#1B2F6E] rounded-[6px] cursor-pointer hover:bg-[rgba(108,92,231,0.06)] transition-colors">
            <CalendarIcon size={16} className="shrink-0 text-[#4285F4]" /> Search upcoming events
          </li>
          <li className="flex items-center gap-[10px] px-[4px] py-[6px] text-[14px] font-normal text-[#1B2F6E] rounded-[6px] cursor-pointer hover:bg-[rgba(108,92,231,0.06)] transition-colors">
            <Plus size={16} className="shrink-0 text-[#4285F4]" /> Create meetings
          </li>
          <li className="flex items-center gap-[10px] px-[4px] py-[6px] text-[14px] font-normal text-[#1B2F6E] rounded-[6px] cursor-pointer hover:bg-[rgba(108,92,231,0.06)] transition-colors">
            <Users size={16} className="shrink-0 text-[#4285F4]" /> Add attendees
          </li>
        </ul>
      </motion.div>

      {/* Drive Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2 }}
        className="border-[1.5px] border-[#8EC9A0] bg-[#F3FAF5] rounded-[12px] p-[20px] flex flex-col midnight-shadow"
      >
        <div className="flex justify-between items-center flex-nowrap gap-[12px]">
          <div className="flex items-center gap-[10px] shrink-0">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9.25 4.5L2.5 16L12.5 10L9.25 4.5Z" fill="#4285F4"/>
              <path d="M22.5 16L15.75 4.5H9.25L16 16H22.5Z" fill="#FBBC05"/>
              <path d="M5.75 21.5H19.25L22.5 16L15.75 10L5.75 21.5Z" fill="#34A853"/>
            </svg>
            <span className="text-xl font-headline font-extrabold text-[#1B2F6E]">Drive</span>
          </div>
          <button className="px-[14px] text-[13px] font-medium rounded-[8px] h-[34px] bg-[#4A7BC4] text-white border-none whitespace-nowrap shrink-0 flex items-center justify-center">
            <Plus size={14} className="mr-1.5" /> New File
          </button>
        </div>
        <div className="border-none border-t border-[rgba(27,47,110,0.10)] my-[14px]"></div>
        <ul className="flex-1 space-y-0">
          <li className="flex items-center gap-[10px] px-[4px] py-[6px] text-[14px] font-normal text-[#1B2F6E] rounded-[6px] cursor-pointer hover:bg-[rgba(108,92,231,0.06)] transition-colors">
            <Search size={16} className="shrink-0 text-[#34A853]" /> Search files & docs
          </li>
          <li className="flex items-center gap-[10px] px-[4px] py-[6px] text-[14px] font-normal text-[#1B2F6E] rounded-[6px] cursor-pointer hover:bg-[rgba(108,92,231,0.06)] transition-colors">
            <FileText size={16} className="shrink-0 text-[#34A853]" /> Find by name or content
          </li>
          <li className="flex items-center gap-[10px] px-[4px] py-[6px] text-[14px] font-normal text-[#1B2F6E] rounded-[6px] cursor-pointer hover:bg-[rgba(108,92,231,0.06)] transition-colors">
            <FileText size={16} className="shrink-0 text-[#34A853]" /> Open file links
          </li>
        </ul>
      </motion.div>
    </div>
  </section>
);

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-24">
        <Hero />
        <SocialProof />
        <Features />
        <HowItWorks />
        
        <Integrations />

        <Comparison />
        <Pricing />

        {/* Final CTA Section */}
        <section className="py-24 px-8">
          <div className="max-w-5xl mx-auto rounded-3xl p-12 lg:p-20 text-center space-y-8 relative overflow-hidden bg-gradient-to-br from-primary to-secondary">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <h2 className="text-4xl lg:text-6xl font-headline font-extrabold text-white leading-tight">Ready to reclaim your mornings?</h2>
            <p className="text-white/70 text-lg max-w-2xl mx-auto">Join 1,000+ professionals who trust CouchMail to handle their workspace intelligence.</p>
            <div className="pt-4">
              <button className="bg-white text-primary px-10 py-5 rounded-full font-extrabold text-xl midnight-shadow hover:scale-105 transition-all">
                Get Started for Free
              </button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
