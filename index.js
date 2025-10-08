const { default: axios } = require('axios');
const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const dotenv = require("dotenv");


dotenv.config(); // carrega as variáveis do .env

const getWppVersion = async () => {
    const page = await axios.get('https://wppconnect.io/pt-BR/whatsapp-versions/');

    let versao = null;
    if (page.data) {
        for (let i = 0; i < page.data.length;) {
            i = page.data.indexOf('href="https://web.whatsapp.com/?v=', i);
            if (i < 0)
                break;

            i += 34;

            const fim = page.data.indexOf('-', i)
            if (fim <= i)
                continue;

            versao = page.data.substring(i, fim);
            if (isNaN(parseFloat(versao))) {
                versao = null;
                continue;
            }
            break;
        }
    }
    if (!versao || !versao.length) {
        console.log("Versão do WhatsApp não encontrada");
    }
    
    return versao.replace(/\./g, ',');    
}


async function runTask() {
    // Cria instância do navegador
    // let driver = await new Builder().forBrowser('chrome').build();
    const user = process.env.user;
    const pass = process.env.pass;
    // Nova versão a ser inserida (Exemplo: "2,3000,1027721308")
    const newVersion = await getWppVersion(); // Substitua pela versão desejada
    if (!newVersion) {
        console.log("Não foi possível obter a nova versão. Encerrando o script.");
        return;
    }
    console.log("Versão:", newVersion);

    const urls = process.env.servers.split(',').map(u => u.trim());

    let options = new chrome.Options();
    // options.addArguments('--headless=new');
    options.addArguments('--window-size=1366,768');

    let driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    try {
        console.log("Iniciando o navegador...");

        // 1. Abre o Google e faz login
        await driver.get(process.env.managerUrl);
        await driver.sleep(2500); // Aguarda o carregamento inicial

        // 2. Localiza e preenche os campos de login
        await driver.findElement(By.xpath('//input[@id="username"]')).sendKeys(user);
        await driver.findElement(By.xpath('//input[@id="password"]')).sendKeys(pass, Key.RETURN);

        console.log("Login realizado. Aguardando a página principal...");
        await driver.sleep(3500); // Aguarda o redirecionamento pós-login

        // 3. Obtém o identificador da aba original (principal)
        const originalHandle = await driver.getWindowHandle();
        console.log(`ID da Aba Principal Salvo: ${originalHandle}`);

        // 4. Inicia o loop para processar cada URL
        for (let i = 0; i < urls.length; i++) {
            const currentUrlSegment = urls[i];
            const fullUrl = currentUrlSegment;

            console.log(`\n--- Processando URL: ${currentUrlSegment} ---`);

            // A. Abre uma nova aba e alterna o foco automaticamente
            await driver.switchTo().newWindow('tab');
            await driver.get(fullUrl);
            console.log(`Nova aba aberta e navegada para: ${fullUrl}`);
            await driver.sleep(2000); // Aguarda o carregamento da página do Docker Stack

            // C. Clica no botão "Editor"
            await driver.findElement(By.xpath(`//a[contains(.,'Editor')]`)).click();
            console.log('Botão "Editor" clicado. Aguardando o carregamento do editor...');

            await driver.sleep(3000); // Aguarda o carregamento do editor

            await driver.executeScript(`
                const elementScroll = document.querySelector('.cm-scroller');
                elementScroll.scrollTop = elementScroll.scrollHeight - 1000;
            `);

            await driver.sleep(2000); // Aguarda o carregamento do editor

            // D. Encontra a linha de configuração e a modifica (Usando Espera Explícita)
            const configXPath = `//div[@id="stack-editor"]/div/div/div/div[contains(., "CONFIG_SESSION_PHONE_VERSION")]`;

            // Espera até 10 segundos para que o elemento apareça
            const configElement = await driver.wait(until.elementLocated(By.xpath(configXPath)), 10000);

            await driver.executeScript(`
                // arguments[0] é o elemento (span)
                // arguments[1] é a nova versão (string)
                let elemento = arguments[0];
                let prefixo = '      - CONFIG_SESSION_PHONE_VERSION=';
                let novoTexto = prefixo + arguments[1];
                
                // Substitui o texto completo do span pelo novo valor
                elemento.textContent = novoTexto;
            `, configElement, newVersion);

            await driver.sleep(500); // Pausa para visualizar a mudança

            await driver.executeScript(`
                const elDeploy = document.querySelector('button[ng-click="deployStack()"]');
                elDeploy.scrollIntoView({ behavior: 'smooth', block: 'center' });
            `)
            await driver.sleep(1000); // Pausa para visualizar a mudança
            await driver.findElement(By.xpath(`//por-switch-field[@name="prune"]//div//label[contains(@class, 'SwitchField-Switch-module__root')]`)).click();
            await driver.sleep(1000); // Pausa para visualizar a mudança
            await driver.findElement(By.xpath(`//button[@ng-click="deployStack()"]`)).click();
            await driver.sleep(1000); // Pausa para visualizar a mudança
            await driver.findElement(By.xpath(`//*[@class='app-react-components-modals-Modal-Modal-module__modal-content relative']//button[contains(text(), 'Update')]`)).click();
            await driver.sleep(3000); // Aguarda o deploy
            await driver.close();
            await driver.switchTo().window(originalHandle);
        }


        console.log("\nProcesso concluído!");

    } catch (err) {
        console.error("Ocorreu um erro durante a execução:", err);
    } finally {
        // Se você quiser que o navegador feche automaticamente no final
        await driver.quit();
    }
}

runTask();
