import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { t } from '@/lib/i18n'

export default function ImprintPage() {
  return (
    <div class="max-w-2xl mx-auto">
      <h1 class="text-3xl font-extrabold mb-6">{t('app.imprint')}</h1>

      <div class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('app.operator')}</CardTitle>
          </CardHeader>
          <CardContent class="text-sm text-muted-foreground leading-relaxed">
            <p>{t('app.this_service_is_operated_by_the_organisation_or_individual_who_deploye')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('app.contact')}</CardTitle>
          </CardHeader>
          <CardContent class="text-sm text-muted-foreground leading-relaxed">
            <p>
              {t('app.email')}: <a href="mailto:admin@example.com" class="underline">admin@example.com</a><br />
              {t('app.address')}: {t('app.123_example_street_12345_example_city_country')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('app.open_source')}</CardTitle>
          </CardHeader>
          <CardContent class="text-sm text-muted-foreground leading-relaxed">
            <p>
              {t('app.opet_is_open_source_software_the_source_code_is_available_at')}{' '}
              <a href="https://github.com/pdiegmann/oPet" target="_blank" rel="noopener noreferrer" class="underline">
                GitHub repository
              </a>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
