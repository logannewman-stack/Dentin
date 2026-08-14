import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Mail, ShieldCheck, UserPlus } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { Pill } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import ActivityLedger from '@/components/ActivityLedger'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import { listRecentActivity, listTeam } from '@/lib/repository'

/**
 * Roles are deliberately coarse. A practice does not want a permissions
 * matrix; it wants to know that an assistant cannot quietly place a $9,000
 * order and that the ledger names whoever moved the stock.
 */
const ROLES = {
  owner: {
    label: 'Owner',
    tone: 'brand',
    can: ['Everything, including billing and vendor accounts'],
  },
  manager: {
    label: 'Manager',
    tone: 'info',
    can: ['Place and receive orders', 'Set par levels', 'Manage vendor accounts'],
  },
  clinician: {
    label: 'Clinician',
    tone: 'quiet',
    can: ['Use and count stock', 'Request reorders'],
  },
  assistant: {
    label: 'Assistant',
    tone: 'quiet',
    can: ['Use, receive and count stock'],
  },
  viewer: { label: 'Viewer', tone: 'quiet', can: ['Read-only access'] },
}

export default function Team() {
  const navigate = useNavigate()
  const toast = useToast()

  const { data: team } = useData(() => listTeam(), [])
  const { data: activity } = useData(() => listRecentActivity(20), [])

  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('assistant')
  const [detail, setDetail] = useState(null)

  // Who has actually been moving stock lately.
  const activityByUser = useMemo(() => {
    const map = new Map()
    for (const m of activity ?? []) {
      map.set(m.userName, (map.get(m.userName) ?? 0) + 1)
    }
    return map
  }, [activity])

  const invite = () => {
    toast({
      title: 'Invite sent',
      body: `${email} joins as ${ROLES[role].label.toLowerCase()}`,
    })
    setInviting(false)
    setEmail('')
  }

  return (
    <Screen
      title="Team"
      subtitle={`${team?.length ?? 0} people`}
      largeTitle={false}
      leading={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="press flex items-center gap-0.5 pl-1 text-brand-600 dark:text-brand-400"
        >
          <ChevronLeft size={24} strokeWidth={2.2} />
          <span className="text-body">Back</span>
        </button>
      }
      trailing={
        <button
          type="button"
          onClick={() => setInviting(true)}
          aria-label="Invite someone"
          className="press flex h-9 w-9 items-center justify-center text-brand-600 dark:text-brand-400"
        >
          <UserPlus size={20} strokeWidth={2} />
        </button>
      }
    >
      <Section title="Members" footer="Every stock movement is attributed to the person who made it.">
        {(team ?? []).map((member) => {
          const roleMeta = ROLES[member.role] ?? ROLES.viewer
          const count = activityByUser.get(member.name) ?? 0
          return (
            <Row
              key={member.id}
              onClick={() => setDetail(member)}
              leading={
                <span
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[4px] bg-brand-600 text-caption font-bold text-white"
                  aria-hidden="true"
                >
                  {member.initials}
                </span>
              }
              title={member.name}
              subtitle={count ? `${count} movements recently` : 'No recent activity'}
              trailing={<Pill tone={roleMeta.tone}>{roleMeta.label}</Pill>}
            />
          )
        })}
      </Section>

      <Section
        title="Recent activity"
        footer="The practice-wide ledger. Open any item for its full history."
      >
        <ActivityLedger movements={(activity ?? []).slice(0, 12)} showProduct />
      </Section>

      {/* Invite */}
      <Sheet
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invite to the practice"
        detent="medium"
        footer={
          <Button
            className="w-full"
            size="lg"
            disabled={!email.includes('@')}
            onClick={invite}
          >
            Send invite
          </Button>
        }
      >
        <div className="py-2">
          <div className="panel">
            <label className="row block py-2.5">
              <span className="block text-caption font-medium uppercase tracking-[0.4px] text-label-3">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@practice.com"
                className="mt-0.5 w-full bg-transparent text-body text-label placeholder:text-label-3 focus:outline-none"
              />
            </label>
          </div>

          <Section title="Role">
            {Object.entries(ROLES)
              .filter(([key]) => key !== 'owner')
              .map(([key, meta]) => (
                <Row
                  key={key}
                  chevron={false}
                  onClick={() => setRole(key)}
                  title={meta.label}
                  subtitle={meta.can.join(' · ')}
                  trailing={
                    role === key ? (
                      <Pill tone="brand" icon={ShieldCheck}>
                        Selected
                      </Pill>
                    ) : null
                  }
                />
              ))}
          </Section>
        </div>
      </Sheet>

      {/* Member detail */}
      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ''}
        detent="medium"
      >
        {detail ? (
          <div className="py-2">
            <div className="flex flex-col items-center py-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-[6px] bg-brand-600 text-title2 font-bold text-white">
                {detail.initials}
              </span>
              <p className="mt-3 text-title3 font-semibold">{detail.name}</p>
              <Pill tone={(ROLES[detail.role] ?? ROLES.viewer).tone} className="mt-1.5">
                {(ROLES[detail.role] ?? ROLES.viewer).label}
              </Pill>
            </div>

            <Section title="Can">
              {(ROLES[detail.role] ?? ROLES.viewer).can.map((c) => (
                <Row
                  key={c}
                  chevron={false}
                  title={c}
                  leading={
                    <ShieldCheck size={15} className="text-ios-green" strokeWidth={2.4} aria-hidden="true" />
                  }
                />
              ))}
            </Section>

            {detail.email ? (
              <Section title="Contact">
                <Row
                  title={detail.email}
                  chevron={false}
                  leading={<Mail size={15} className="text-label-3" aria-hidden="true" />}
                  onClick={() => window.open(`mailto:${detail.email}`)}
                />
              </Section>
            ) : null}

            <Section title="Recent movements">
              <ActivityLedger
                movements={(activity ?? []).filter((m) => m.userName === detail.name).slice(0, 8)}
                showProduct
              />
            </Section>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  )
}
