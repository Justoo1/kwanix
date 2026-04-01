import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";

/* ── Color swatch helper ─────────────────────────────────── */

function Swatch({
  label,
  className,
  textClass = "text-white",
}: {
  label: string;
  className: string;
  textClass?: string;
}) {
  return (
    <div
      className={`${className} rounded-lg px-4 py-5 flex flex-col gap-1 min-w-[120px]`}
    >
      <span className={`text-xs font-semibold ${textClass}`}>{label}</span>
    </div>
  );
}

/* ── Table demo data ─────────────────────────────────────── */

const tableRows = [
  { id: "T-001", route: "Accra → Kumasi", status: "departed", seats: 42 },
  { id: "T-002", route: "Kumasi → Prestea", status: "scheduled", seats: 50 },
  { id: "T-003", route: "Accra → Prestea", status: "arrived", seats: 38 },
  { id: "T-004", route: "Prestea → Accra", status: "cancelled", seats: 0 },
];

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  departed: "default",
  scheduled: "secondary",
  arrived: "outline",
  cancelled: "destructive",
};

/* ── Page ────────────────────────────────────────────────── */

export default function StyleguidePage() {
  return (
    <div className="space-y-12 animate-fade-up pb-16">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Design System</h1>
        <p className="text-sm text-muted-foreground mt-1">
          RoutePass UI primitives — color tokens, components, and states.
        </p>
      </div>

      {/* ── Color palette ──────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Color Tokens</h2>

        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Base surfaces
          </p>
          <div className="flex flex-wrap gap-3">
            <Swatch label="background" className="bg-background border border-border" textClass="text-foreground" />
            <Swatch label="card" className="bg-card border border-border" textClass="text-card-foreground" />
            <Swatch label="muted" className="bg-muted" textClass="text-muted-foreground" />
            <Swatch label="accent" className="bg-accent" textClass="text-accent-foreground" />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Brand
          </p>
          <div className="flex flex-wrap gap-3">
            <Swatch label="primary" className="bg-primary" />
            <Swatch label="secondary" className="bg-secondary border border-border" textClass="text-secondary-foreground" />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            High-contrast alert states (scanning logic)
          </p>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-lg px-4 py-5 min-w-[160px] flex flex-col gap-1 bg-[oklch(0.70_0.22_145)]">
              <CheckCircle2 className="h-5 w-5 text-white" />
              <span className="text-sm font-bold text-white">--success</span>
              <span className="text-xs text-white/80">Scan confirmed / valid ticket</span>
            </div>
            <div className="rounded-lg px-4 py-5 min-w-[160px] flex flex-col gap-1 bg-[oklch(0.60_0.27_25)]">
              <XCircle className="h-5 w-5 text-white" />
              <span className="text-sm font-bold text-white">--destructive</span>
              <span className="text-xs text-white/80">Scan failed / invalid ticket</span>
            </div>
            <div className="rounded-lg px-4 py-5 min-w-[160px] flex flex-col gap-1 bg-sidebar border border-sidebar-border">
              <span className="text-sm font-bold text-sidebar-foreground">--sidebar</span>
              <span className="text-xs text-sidebar-foreground/60">Nav surface</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Buttons ────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button className="btn-press btn-glow-primary">Primary</Button>
          <Button variant="secondary" className="btn-press">Secondary</Button>
          <Button variant="outline" className="btn-press">Outline</Button>
          <Button variant="ghost" className="btn-press">Ghost</Button>
          <Button variant="destructive" className="btn-press btn-glow-destructive">
            Destructive
          </Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Button size="sm" className="btn-press">Small</Button>
          <Button size="default" className="btn-press">Default</Button>
          <Button size="lg" className="btn-press">Large</Button>
          <Button size="icon" className="btn-press">
            <Info className="h-4 w-4" />
          </Button>
        </div>

        {/* Alert-state buttons for scanning */}
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-press btn-glow-success flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all
                       bg-[oklch(0.70_0.22_145)] text-white hover:bg-[oklch(0.65_0.22_145)]"
          >
            <CheckCircle2 className="h-4 w-4" /> Confirm Scan
          </button>
          <button
            className="btn-press btn-glow-destructive flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all
                       bg-destructive text-destructive-foreground hover:opacity-90"
          >
            <XCircle className="h-4 w-4" /> Reject Scan
          </button>
        </div>
      </section>

      {/* ── Badges ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Badges</h2>
        <div className="flex flex-wrap gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge className="bg-success text-success-foreground">Success</Badge>
          <Badge className="bg-muted text-muted-foreground border border-border">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        </div>
      </section>

      {/* ── Form inputs ────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Inputs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div className="space-y-2">
            <Label htmlFor="demo-text">Text input</Label>
            <Input id="demo-text" placeholder="e.g. GR-1234-24" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-disabled">Disabled</Label>
            <Input id="demo-disabled" placeholder="Disabled" disabled />
          </div>
          <div className="space-y-2">
            <Label>Select</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Pick a route" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="acc-kum">Accra → Kumasi</SelectItem>
                <SelectItem value="kum-pre">Kumasi → Prestea</SelectItem>
                <SelectItem value="acc-pre">Accra → Prestea</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── Cards ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Trips</CardTitle>
              <CardDescription>Currently in transit</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">12</p>
            </CardContent>
          </Card>
          <Card className="border-[oklch(0.70_0.22_145/0.4)] bg-[oklch(0.70_0.22_145/0.05)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[oklch(0.70_0.22_145)]" />
                Tickets Scanned
              </CardTitle>
              <CardDescription>Valid — last 24 h</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-[oklch(0.70_0.22_145)]">847</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                Failed Scans
              </CardTitle>
              <CardDescription>Rejected — last 24 h</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-destructive">3</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Table ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Table</h2>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trip ID</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Seats</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium font-mono text-xs">
                    {row.id}
                  </TableCell>
                  <TableCell>{row.route}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[row.status]}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{row.seats}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      {/* ── Dialog ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Dialog</h2>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="btn-press">Open Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Boarding</DialogTitle>
              <DialogDescription>
                Ticket TKT-00421 is valid for{" "}
                <strong>Accra → Kumasi</strong> on{" "}
                <strong>Trip T-001</strong>. Allow passenger to board?
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 mt-2">
              <Button className="flex-1 btn-press bg-[oklch(0.70_0.22_145)] hover:bg-[oklch(0.65_0.22_145)] text-white btn-glow-success">
                <CheckCircle2 className="h-4 w-4 mr-2" /> Allow
              </Button>
              <Button variant="destructive" className="flex-1 btn-press btn-glow-destructive">
                <XCircle className="h-4 w-4 mr-2" /> Deny
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>

      {/* ── Animation states ───────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Scanning State Indicators</h2>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-[oklch(0.70_0.22_145/0.4)] px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-[oklch(0.70_0.22_145)] animate-scan-pulse" />
            <span className="text-sm font-medium text-[oklch(0.70_0.22_145)]">
              Scanner active
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-destructive animate-scan-pulse" />
            <span className="text-sm font-medium text-destructive">
              Scan rejected
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-muted-foreground/20 px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-muted-foreground/40" />
            <span className="text-sm text-muted-foreground">Idle</span>
          </div>
        </div>
      </section>
    </div>
  );
}
