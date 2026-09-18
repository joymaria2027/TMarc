import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CHART_COLORS } from '@/lib/finance';

export type DailyDatum = { date: string; count: number };
export type StatusDatum = { name: string; value: number };
export type PaymentDatum = { name: string; value: number };
export type PaymentRevenueDatum = { name: string; revenue: number };
export type MerchantDatum = { name: string; deliveries: number; revenue: number; avgTime: number };
export type RiderDatum = { name: string; deliveries: number; distance: number; avgTime: number; efficiency: number };

function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function TeachingEmpty({ what, hint, onClear }: { what: string; hint: string; onClear?: () => void }) {
  return (
    <div className="text-center py-10">
      <p className="font-medium">{what}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{hint}</p>
      {onClear && <Button variant="outline" size="sm" className="mt-3" onClick={onClear}>Clear payment filter</Button>}
    </div>
  );
}

export default function AnalyticsCharts(props: {
  dailyData: DailyDatum[];
  statusData: StatusDatum[];
  paymentData: PaymentDatum[];
  paymentRevenueData: PaymentRevenueDatum[];
  merchantData: MerchantDatum[];
  riderPerf: RiderDatum[];
  onClearFilter: () => void;
  merchantTruncated: boolean;
}) {
  const { dailyData, statusData, paymentData, paymentRevenueData, merchantData, riderPerf, onClearFilter, merchantTruncated } = props;
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Daily Deliveries</CardTitle></CardHeader>
        <CardContent>
          {dailyData.length > 0 ? (
            <div role="img" aria-label={`Line chart of daily deliveries for the last ${dailyData.length} days, peak ${Math.max(...dailyData.map(d => d.count))} per day`}>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke={CHART_COLORS[0]} strokeWidth={2} name="Deliveries" />
                </LineChart>
              </ResponsiveContainer>
              <SrTable caption="Daily deliveries" head={['Date', 'Deliveries']} rows={dailyData.map(d => [d.date, d.count])} />
            </div>
          ) : <TeachingEmpty what="No deliveries in this view yet" hint="Deliveries appear here once completed. Try clearing the payment filter." onClear={onClearFilter} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Delivery Status</CardTitle></CardHeader>
        <CardContent>
          {statusData.length > 0 ? (
            <div role="img" aria-label={`Pie chart of delivery status: ${statusData.map(s => `${s.name} ${s.value}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <SrTable caption="Delivery status" head={['Status', 'Count']} rows={statusData.map(s => [s.name, s.value])} />
            </div>
          ) : <TeachingEmpty what="No status data yet" hint="Status breakdown appears once deliveries exist in this filter." onClear={onClearFilter} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Payment Methods (Count)</CardTitle></CardHeader>
        <CardContent>
          {paymentData.length > 0 ? (
            <div role="img" aria-label={`Pie chart of payment method counts: ${paymentData.map(p => `${p.name} ${p.value}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {paymentData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <SrTable caption="Payment method counts" head={['Method', 'Count']} rows={paymentData.map(p => [p.name, p.value])} />
            </div>
          ) : <TeachingEmpty what="No payment data yet" hint="Payment counts appear once delivered orders record a payment method." onClear={onClearFilter} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Revenue by Payment Method</CardTitle></CardHeader>
        <CardContent>
          {paymentRevenueData.length > 0 ? (
            <div role="img" aria-label={`Bar chart of revenue in dalasi by payment method, top ${paymentRevenueData[0]?.name} at D${paymentRevenueData[0]?.revenue.toFixed(2)}`}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={paymentRevenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => `D${Number(v).toFixed(2)}`} />
                  <Bar dataKey="revenue" fill={CHART_COLORS[0]} name="Revenue (D)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <SrTable caption="Revenue by payment method in dalasi" head={['Method', 'Revenue (D)']} rows={paymentRevenueData.map(p => [p.name, p.revenue.toFixed(2)])} />
            </div>
          ) : <TeachingEmpty what="No revenue yet" hint="Revenue appears once delivered orders have tariffs in this filter." onClear={onClearFilter} />}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base">Merchant Breakdown</CardTitle></CardHeader>
        <CardContent>
          {merchantData.length > 0 ? (
            <div role="img" aria-label={`Bar chart of merchant deliveries (left axis, count) and revenue in dalasi (right axis). Top merchant ${merchantData[0]?.name} with ${merchantData[0]?.deliveries} deliveries.`}>
              <p className="text-xs text-muted-foreground mb-2">Left axis: deliveries (count). Right axis: revenue (D). Avg minutes are listed in the data table below.</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={merchantData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis yAxisId="left" fontSize={12} allowDecimals={false} label={{ value: 'Deliveries', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" fontSize={12} label={{ value: 'Revenue (D)', angle: 90, position: 'insideRight', fontSize: 11 }} />
                  <Tooltip formatter={(v: number, name: string) => name === 'Revenue (D)' ? `D${Number(v).toFixed(2)}` : v} />
                  <Bar yAxisId="left" dataKey="deliveries" fill={CHART_COLORS[0]} name="Deliveries" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="revenue" fill={CHART_COLORS[1]} name="Revenue (D)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <SrTable
                caption="Merchant deliveries, revenue and average minutes"
                head={['Merchant', 'Deliveries', 'Revenue (D)', 'Avg min']}
                rows={merchantData.map(r => [r.name, r.deliveries, r.revenue.toFixed(2), r.avgTime])}
              />
              {merchantTruncated && <p className="text-xs text-muted-foreground mt-2">Showing top 20 merchants by deliveries.</p>}
            </div>
          ) : <TeachingEmpty what="No merchant data yet" hint="Merchant totals appear once deliveries are completed in this filter." onClear={onClearFilter} />}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base">Rider Performance</CardTitle></CardHeader>
        <CardContent>
          {riderPerf.length > 0 ? (
            <div role="img" aria-label={`Bar chart of rider deliveries, distance in km and efficiency percent for ${riderPerf.length} riders`}>
              <p className="text-xs text-muted-foreground mb-2">Deliveries (count), distance (km) and efficiency (%) use separate scales — see data table for exact values.</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={riderPerf}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis yAxisId="left" fontSize={12} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" fontSize={12} domain={[0, 100]} />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="deliveries" fill={CHART_COLORS[0]} name="Deliveries" />
                  <Bar yAxisId="left" dataKey="distance" fill={CHART_COLORS[1]} name="Distance (km)" />
                  <Bar yAxisId="right" dataKey="efficiency" fill={CHART_COLORS[2]} name="Efficiency %" />
                </BarChart>
              </ResponsiveContainer>
              <SrTable
                caption="Rider deliveries, distance, average minutes and efficiency"
                head={['Rider', 'Deliveries', 'Distance (km)', 'Avg min', 'Efficiency %']}
                rows={riderPerf.map(r => [r.name, r.deliveries, r.distance, r.avgTime, r.efficiency])}
              />
            </div>
          ) : <TeachingEmpty what="No rider data yet" hint="Rider stats appear once riders complete deliveries in this filter." onClear={onClearFilter} />}
        </CardContent>
      </Card>
    </div>
  );
}
