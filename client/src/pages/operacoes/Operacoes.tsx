import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, PhoneIncoming } from "lucide-react";
import CobrancaAtiva from "./CobrancaAtiva";
import CobrancaPassiva from "./CobrancaPassiva";

export default function Operacoes() {
  const [tab, setTab] = useState("ativa");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="ativa" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Cobrança Ativa
          </TabsTrigger>
          <TabsTrigger value="passiva" className="flex items-center gap-2">
            <PhoneIncoming className="h-4 w-4" />
            Cobrança Passiva
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ativa" className="mt-4">
          <CobrancaAtiva />
        </TabsContent>

        <TabsContent value="passiva" className="mt-4">
          <CobrancaPassiva />
        </TabsContent>
      </Tabs>
    </div>
  );
}
