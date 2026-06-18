
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { type Trade } from "@/lib/types"
import { cn } from "@/lib/utils"
import { History, ArrowUp, ArrowDown, Maximize } from "lucide-react"
import { Button } from "@/components/ui/button";
import { FloatingWindow } from "@/components/ui/floating-window";

type TradeHistoryProps = {
  tradeHistory: Trade[]
}

const TradeList = ({ tradeHistory }: { tradeHistory: Trade[] }) => (
    <div className="p-4 space-y-3">
        {tradeHistory.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-10">
            No trades have been made yet.
        </div>
        )}
        {tradeHistory.map(trade => (
            <div key={trade.id} className={cn("p-3 rounded-lg border-l-4", 
                trade.status === 'Ongoing' ? 'border-blue-500 bg-blue-900/20' : 
                trade.isWin ? 'border-green-500 bg-green-500/10' : 
                'border-red-500 bg-red-500/10'
            )}>
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-3 font-bold">
                        {trade.status === 'Ongoing' ? (
                            <span className="text-blue-400 text-base">ONGOING</span>
                        ) : (
                            <>
                            {trade.isWin ? <span className="text-green-400 text-base">WIN</span> : <span className="text-red-400 text-base">LOSS</span>}
                            <span className={cn("font-mono text-lg", trade.isWin ? 'text-green-500' : 'text-red-500')}>
                               {trade.isWin ? '+' : ''}${trade.profit.toFixed(2)}
                            </span>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                        {trade.type === 'RISE' ? <ArrowUp className="h-4 w-4 text-green-500" /> : <ArrowDown className="h-4 w-4 text-red-500" />}
                        <span>{trade.asset}</span>
                    </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                    <div>ID: {trade.id}</div>
                    <div>{trade.timestamp}</div>
                </div>
            </div>
             {trade.status !== 'Ongoing' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 mt-2 text-xs border-t border-border/50 pt-2">
                    <div><span className="font-semibold text-muted-foreground">Stake:</span> <span className="font-mono">{trade.stake.toFixed(2)}</span></div>
                    <div><span className="font-semibold text-muted-foreground">Entry:</span> <span className="font-mono">{trade.entry}</span></div>
                    <div><span className="font-semibold text-muted-foreground">Exit:</span> <span className="font-mono">{trade.exit}</span></div>
                    <div><span className="font-semibold text-muted-foreground">Duration:</span> <span>{trade.duration}</span></div>
                </div>
            )}
            </div>
        ))}
    </div>
);

export function TradeHistory({ tradeHistory }: TradeHistoryProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-cyan-400" />
            <CardTitle className="text-sm font-semibold">Trade History</CardTitle>
          </div>
           <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsFullScreen(true)}>
            <Maximize className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-grow p-0 overflow-y-auto min-h-0">
          <ScrollArea className="h-full w-full">
            <TradeList tradeHistory={tradeHistory} />
          </ScrollArea>
        </CardContent>
      </Card>
      
      {isFullScreen && (
        <FloatingWindow
          title="Trade History"
          isOpen={isFullScreen}
          onOpenChange={setIsFullScreen}
          initialSize={{ width: 600, height: 500 }}
        >
          <ScrollArea className="h-full w-full">
            <TradeList tradeHistory={tradeHistory} />
          </ScrollArea>
        </FloatingWindow>
      )}
    </>
  )
}
