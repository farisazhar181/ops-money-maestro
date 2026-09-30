import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/master-data")({
  head: () => ({
    meta: [
      { title: "Master Data | Loka Logistics ERP" },
      {
        name: "description",
        content:
          "Manage customers and subcontractor vendors used across job sheets, invoices and bills.",
      },
      { property: "og:title", content: "Master Data | Loka Logistics ERP" },
      { property: "og:description", content: "Customer and vendor master records." },
    ],
  }),
  component: MasterData,
});

function MasterData() {
  const qc = useQueryClient();
  const { canEditMasterData: canEditJobs } = useRoles();
  const [custOpen, setCustOpen] = useState(false);
  const [vendOpen, setVendOpen] = useState(false);
  const [custId, setCustId] = useState<string | null>(null);
  const [vendId, setVendId] = useState<string | null>(null);
  const [cust, setCust] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [vend, setVend] = useState({
    vendor_name: "",
    service_type: "",
    contact_person: "",
    phone: "",
  });

  const customers = useQuery({
    queryKey: ["customers-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("company_name");
      if (error) throw error;
      return data;
    },
  });

  const vendors = useQuery({
    queryKey: ["vendors-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcontractors_vendors")
        .select("*")
        .order("vendor_name");
      if (error) throw error;
      return data;
    },
  });

  const addCustomer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("save_customer", {
        _id: custId as unknown as string,
        _company_name: cust.company_name,
        _contact_name: cust.contact_name,
        _phone: cust.phone,
        _email: cust.email,
        _address: cust.address,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(custId ? "Customer updated" : "Customer added");
      setCustId(null);
      setCustOpen(false);
      setCust({ company_name: "", contact_name: "", phone: "", email: "", address: "" });
      qc.invalidateQueries({ queryKey: ["customers-full"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addVendor = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("save_vendor", {
        _id: vendId as unknown as string,
        _vendor_name: vend.vendor_name,
        _service_type: vend.service_type,
        _contact_person: vend.contact_person,
        _phone: vend.phone,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(vendId ? "Vendor updated" : "Vendor added");
      setVendId(null);
      setVendOpen(false);
      setVend({ vendor_name: "", service_type: "", contact_person: "", phone: "" });
      qc.invalidateQueries({ queryKey: ["vendors-full"] });
      qc.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Master Data</h1>
        <p className="text-sm text-muted-foreground">Customers and subcontractor vendors.</p>
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Customers ({customers.data?.length ?? 0})</CardTitle>
              {canEditJobs && (
                <Dialog open={custOpen} onOpenChange={setCustOpen}>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      onClick={() => {
                        setCustId(null);
                        setCust({
                          company_name: "",
                          contact_name: "",
                          phone: "",
                          email: "",
                          address: "",
                        });
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add customer
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{custId ? "Edit customer" : "New customer"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {(
                        [
                          ["Company name", "company_name"],
                          ["Contact name", "contact_name"],
                          ["Phone", "phone"],
                          ["Email", "email"],
                          ["Address", "address"],
                        ] as const
                      ).map(([label, key]) => (
                        <div key={key} className="space-y-2">
                          <Label>{label}</Label>
                          <Input
                            value={cust[key]}
                            onChange={(e) => setCust({ ...cust, [key]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => addCustomer.mutate()}
                        disabled={!cust.company_name || addCustomer.isPending}
                      >
                        {custId ? "Save changes" : "Save customer"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Address</TableHead>
                    {canEditJobs && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(customers.data ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.company_name}</TableCell>
                      <TableCell>{c.contact_name}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell>{c.email}</TableCell>
                      <TableCell className="text-muted-foreground">{c.address}</TableCell>
                      {canEditJobs && (
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit ${c.company_name}`}
                            onClick={() => {
                              setCustId(c.id);
                              setCust({
                                company_name: c.company_name,
                                contact_name: c.contact_name ?? "",
                                phone: c.phone ?? "",
                                email: c.email ?? "",
                                address: c.address ?? "",
                              });
                              setCustOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {(customers.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No customers yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendors" className="pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Vendors ({vendors.data?.length ?? 0})</CardTitle>
              {canEditJobs && (
                <Dialog open={vendOpen} onOpenChange={setVendOpen}>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      onClick={() => {
                        setVendId(null);
                        setVend({
                          vendor_name: "",
                          service_type: "",
                          contact_person: "",
                          phone: "",
                        });
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add vendor
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{vendId ? "Edit vendor" : "New vendor"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {(
                        [
                          ["Vendor name", "vendor_name"],
                          ["Service type", "service_type"],
                          ["Contact person", "contact_person"],
                          ["Phone", "phone"],
                        ] as const
                      ).map(([label, key]) => (
                        <div key={key} className="space-y-2">
                          <Label>{label}</Label>
                          <Input
                            value={vend[key]}
                            onChange={(e) => setVend({ ...vend, [key]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => addVendor.mutate()}
                        disabled={!vend.vendor_name || addVendor.isPending}
                      >
                        {vendId ? "Save changes" : "Save vendor"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Contact person</TableHead>
                    <TableHead>Phone</TableHead>
                    {canEditJobs && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(vendors.data ?? []).map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.vendor_name}</TableCell>
                      <TableCell>{v.service_type}</TableCell>
                      <TableCell>{v.contact_person}</TableCell>
                      <TableCell>{v.phone}</TableCell>
                      {canEditJobs && (
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit ${v.vendor_name}`}
                            onClick={() => {
                              setVendId(v.id);
                              setVend({
                                vendor_name: v.vendor_name,
                                service_type: v.service_type ?? "",
                                contact_person: v.contact_person ?? "",
                                phone: v.phone ?? "",
                              });
                              setVendOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {(vendors.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No vendors yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
