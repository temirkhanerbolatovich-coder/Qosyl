import 'dotenv/config';
import nodemailer from 'nodemailer';
import { getSmtpSettings } from '../src/lib/mail-settings';

async function main() {
  const settings = getSmtpSettings(process.env);
  if (!process.argv.includes('--connect')) {
    console.log(
      'Конфигурация SMTP корректна. Сеть и отправка письма не проверялись. Для проверки подключения: npm run mail:check -- --connect',
    );
    return;
  }
  try {
    const transport = nodemailer.createTransport(settings.transport);
    await transport.verify();
    transport.close();
    console.log(
      'Соединение, TLS и аутентификация SMTP проверены. Доставка письма получателю этим не подтверждается.',
    );
  } catch {
    throw new Error(
      'Не удалось подтвердить SMTP-соединение. Проверьте адрес провайдера, TLS, учетные данные и сетевой доступ; секреты в журнал не выводятся.',
    );
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Ошибка проверки SMTP.');
  process.exitCode = 1;
});
