import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Route, Routes } from "react-router-dom"

import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import Index from "@/pages/Index"
import NotFound from "@/pages/NotFound"

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              {/* Add new routes above the catch-all route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </Toaster>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
