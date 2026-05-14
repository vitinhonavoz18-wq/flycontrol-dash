import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  BarChart3, 
  TrendingUp, 
  Package, 
  DollarSign, 
  Calendar,
  AlertCircle,
  Trophy,
  ArrowUpRight,
  Calculator
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/finance")({
  component: FinancialManagement,
});

// Since the path was /settings and I want to add it as a new section or replace, 
// let's create it as a new route in the file system instead.
// Wait, I should probably create a new file src/routes/_app/finance.tsx 
// and add it to the menu.
