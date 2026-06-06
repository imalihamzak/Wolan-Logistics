import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import logo from "@/assets/logo.jpeg";
import { useAuth } from "../contexts/AuthContext";

interface LayoutProps {
  children?: ReactNode;
}

export default function Layout({ children = null }: LayoutProps) {
  const { user } = useAuth();
  const isAdminLayout = Boolean(user && !["merchant", "rider"].includes(user.role));

  return (
    <div data-cmp="Layout" className="relative min-h-dvh w-full max-w-full overflow-hidden bg-background lg:pl-60">
      {isAdminLayout ? (
        <div aria-hidden="true" className="admin-brand-backdrop pointer-events-none fixed inset-y-0 left-0 right-0 z-0 overflow-hidden lg:left-60">
          <img
            src={logo}
            alt=""
            className="absolute right-[-7rem] top-1/2 h-[min(86vw,26rem)] w-[min(86vw,26rem)] -translate-y-1/2 object-contain opacity-[0.035] blur-[3px] saturate-50 sm:right-[-4rem] sm:h-[min(60vw,34rem)] sm:w-[min(60vw,34rem)] lg:right-[3vw] lg:h-[min(54vw,46rem)] lg:w-[min(54vw,46rem)] lg:opacity-[0.055]"
          />
          <div className="absolute inset-0 bg-background/55 backdrop-blur-[1px]" />
        </div>
      ) : null}
      <Sidebar />
      <main className="relative z-10 flex h-dvh min-w-0 max-w-full flex-col overflow-hidden" data-px-slot>
        {children}
      </main>
    </div>
  );
}
