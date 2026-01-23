'use client'

export function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 max-w-6xl mx-auto mb-8">
          {/* Left side - Text content */}
          <div className="text-center lg:text-left flex-1">
            <img src="/logo.svg" alt="Minecraft Hosting" className="h-24 md:h-32 mx-auto lg:mx-0 mb-4" />
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-4">
              Cheap Minecraft Server Hosting
            </h1>
            <p className="text-slate-300 mb-2 text-xl md:text-2xl font-medium">Easy Minecraft Hosting Starting at $4.99/month</p>
            <p className="text-slate-400 mb-8 text-base md:text-lg max-w-2xl">
              Get your own private Minecraft server ready in seconds. No technical knowledge required. The easiest and most affordable way to play Minecraft with friends.
            </p>

            <a
              href="/auth/login"
              className="py-4 px-10 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] text-lg inline-block"
            >
              Get Started
            </a>
          </div>

          {/* Right side - Image */}
          <div className="flex-shrink-0">
            <img
              src="/MHskinpose.png"
              alt="Minecraft Character"
              className="w-64 md:w-80 lg:w-96 h-auto drop-shadow-2xl"
            />
          </div>
        </div>

        <div className="text-center max-w-4xl mx-auto">

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left mb-16">
            {/* Feature 1 */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
              <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Instant Minecraft Server Setup</h3>
              <p className="text-slate-400 text-sm">
                Your Minecraft server is ready in seconds. No downloads, no configuration files, no command line. The easiest Minecraft hosting experience available.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Multiplayer Minecraft Made Easy</h3>
              <p className="text-slate-400 text-sm">
                Share your Minecraft server address with friends and start playing together instantly. Build, explore, and survive as a team on your own hosted server.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Cloud Minecraft Hosting</h3>
              <p className="text-slate-400 text-sm">
                Stop worrying about computer specs or leaving your PC running. Our cheap Minecraft server hosting handles all the heavy lifting in the cloud.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
              <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Easy Server Management</h3>
              <p className="text-slate-400 text-sm">
                Start, stop, and manage your Minecraft server from any device. View live logs, monitor performance, and install plugins with one click. Easy Minecraft hosting at its best.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
              <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">DDoS Protected</h3>
              <p className="text-slate-400 text-sm">
                Your server is protected against attacks. Play without interruptions and keep griefers at bay.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
              <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Your World, Your Rules</h3>
              <p className="text-slate-400 text-sm">
                Full control over your server. Add plugins, set permissions, whitelist players, and customize your experience.
              </p>
            </div>
          </div>

          {/* Why Host Section */}
          <div className="bg-slate-900/30 backdrop-blur-sm rounded-2xl p-8 border border-slate-800 mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">Why Choose Our Minecraft Server Hosting?</h2>
            <div className="text-left text-slate-300 space-y-4">
              <p>
                Looking for cheap Minecraft hosting that doesn&apos;t compromise on quality? Our affordable Minecraft server hosting gives you
                your own private world where you decide who can join, what plugins to use, and how the game is played.
              </p>
              <p>
                Whether you want a peaceful survival world with close friends, an epic creative building project,
                or a custom minigame server, our easy Minecraft hosting makes it possible without any technical hassle.
              </p>
              <p className="text-slate-400 text-sm">
                Traditional self-hosting requires port forwarding, static IPs, and keeping your computer running 24/7.
                With our Minecraft server hosting starting at just $4.99/month, we eliminate all of that complexity so you can focus on playing.
              </p>
            </div>
          </div>

          {/* CTA */}
          <a
            href="/auth/login"
            className="py-4 px-10 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] text-lg inline-block"
          >
            Start Your Minecraft Server Now
          </a>
          <p className="text-slate-500 text-sm mt-4">Free trial available. Plans start at just $4.99/month.</p>
        </div>
      </div>
    </main>
  )
}
