import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen w-full flex flex-col bg-[#000000] text-white selection:bg-red-600 selection:text-white font-sans overflow-x-hidden">
      {/* Background Video with Netflix-style Overlay */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-black/50 z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#000] via-transparent to-[#000]/80 z-10" />
        <video 
          className="w-full h-full object-cover opacity-60 scale-105"
          autoPlay 
          muted 
          loop 
          playsInline
        >
          <source src="/bgv.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-5 py-5 md:px-14 md:py-6 w-full max-w-[1920px] mx-auto">
        <Link href="/" className="text-3xl md:text-[2.5rem] font-bold text-[#E50914] tracking-tighter hover:scale-105 transition-transform duration-300">
          IPL AUCTION
        </Link>
      </header>

      {/* Hero Section */}
      <div className="relative z-20 flex-1 flex flex-col items-center justify-center text-center px-6 md:px-8 max-w-[900px] mx-auto -mt-16 sm:-mt-24">
        <h1 className="text-[3rem] sm:text-5xl md:text-6xl lg:text-[5rem] font-black tracking-tight text-white mb-10 leading-[1.15]">
          IPL Auction Arena
        </h1>

        <div className="landing-buttons">
          <Link 
            href="/admin/login" 
            className="primary-button landing-cta !bg-white hover:!bg-gray-200 !text-black transition-colors"
            style={{ backgroundColor: 'white', color: 'black' }}
          >
            Auctioneer Login
          </Link>
          <Link 
            href="/franchise/login" 
            className="primary-button landing-cta !bg-white hover:!bg-gray-200 !text-black transition-colors"
            style={{ backgroundColor: 'white', color: 'black' }}
          >
            Franchise Login
          </Link>
        </div>
      </div>
    </main>
  );
}
