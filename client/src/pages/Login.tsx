import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { Scale } from "lucide-react";

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-md shadow-xl border-2">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center">
            <Scale className="w-8 h-8 text-accent" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold text-primary">
              Gomes & Silva
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Advocacia</p>
          </div>
          <CardDescription className="text-base">
            Sistema de Gestão de Cobranças Condominiais
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <p>Acesse o sistema com sua conta Manus para gerenciar cobranças extrajudiciais de condomínios.</p>
          </div>
          <Button 
            className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => window.location.href = getLoginUrl()}
          >
            Entrar no Sistema
          </Button>
          <div className="pt-4 border-t text-center text-xs text-muted-foreground">
            <p>Assessoria jurídica confiável para auxiliar o síndico com transparência no dia a dia.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
