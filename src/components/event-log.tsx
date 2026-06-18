
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Maximize } from "lucide-react"
import { Button } from "@/components/ui/button";
import { FloatingWindow } from "@/components/ui/floating-window";

type EventLogProps = {
  eventLogs: string[];
}

const LogList = ({ eventLogs }: { eventLogs: string[] }) => (
  <div className="p-4 font-mono text-xs">
    {eventLogs.length > 0 ? (
      eventLogs.map((log, index) => (
        <p key={index} className="whitespace-pre-wrap">{log}</p>
      ))
    ) : (
      <p className="text-muted-foreground font-sans">Logs will appear here when the bot is active.</p>
    )}
  </div>
);

export function EventLog({ eventLogs }: EventLogProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-cyan-400" />
            <CardTitle className="text-sm font-semibold">Event Log</CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsFullScreen(true)}>
            <Maximize className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-grow p-0 overflow-y-auto min-h-0">
          <ScrollArea className="h-full w-full">
            <LogList eventLogs={eventLogs} />
          </ScrollArea>
        </CardContent>
      </Card>

      {isFullScreen && (
        <FloatingWindow
          title="Event Log"
          isOpen={isFullScreen}
          onOpenChange={setIsFullScreen}
          initialSize={{ width: 600, height: 500 }}
        >
          <ScrollArea className="h-full w-full">
            <LogList eventLogs={eventLogs} />
          </ScrollArea>
        </FloatingWindow>
      )}
    </>
  )
}
