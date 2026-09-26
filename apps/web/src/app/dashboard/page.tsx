import { Users, PhoneForwarded, MessageCircle, TrendingUp } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Overview</h1>
        <p className="text-slate-500 text-sm mt-1">Here's what's happening in your organization today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Active Leads" 
          value="142" 
          change="+12%" 
          isPositive={true} 
          icon={Users} 
          color="bg-blue-500" 
        />
        <StatCard 
          title="Calls Forwarded" 
          value="89" 
          change="+5%" 
          isPositive={true} 
          icon={PhoneForwarded} 
          color="bg-emerald-500" 
        />
        <StatCard 
          title="AI Messages" 
          value="1,204" 
          change="+24%" 
          isPositive={true} 
          icon={MessageCircle} 
          color="bg-indigo-500" 
        />
        <StatCard 
          title="Conversion Rate" 
          value="14.2%" 
          change="-2%" 
          isPositive={false} 
          icon={TrendingUp} 
          color="bg-amber-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
          <div className="flex items-center justify-center h-64 border-2 border-dashed border-slate-100 rounded-lg bg-slate-50">
            <p className="text-slate-400 text-sm">Activity chart will appear here</p>
          </div>
        </div>
        
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Upcoming Appointments</h2>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-600 font-medium text-sm">JD</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">John Doe</p>
                  <p className="text-xs text-slate-500">Consultation Call • 2:00 PM</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ 
  title, 
  value, 
  change, 
  isPositive, 
  icon: Icon,
  color
}: { 
  title: string
  value: string
  change: string
  isPositive: boolean
  icon: any
  color: string
}) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-slate-300 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color} bg-opacity-10`}>
          <Icon size={20} className={color.replace('bg-', 'text-')} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <h4 className="text-3xl font-bold text-slate-900 tracking-tight">{value}</h4>
        <span className={`text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {change}
        </span>
      </div>
      <div className={`absolute bottom-0 left-0 h-1 w-full opacity-0 group-hover:opacity-100 transition-opacity ${color}`} />
    </div>
  )
}
