const fs = require('fs');

// ==========================================
// 1. CONFIGURATION DU BOT 
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // La clé du BotFather
const CHAT_ID = "-1001707713364"; // 
const THREAD_ID = "13963"; // L'ID de votre sujet "Quête Quotidienne"

async function executerRituelQuotidien() {
    try {
        // ==========================================
        // 1. CHARGEMENT DES BASES
        // ==========================================
        const quiz_db_raw = JSON.parse(fs.readFileSync('quete_ascension.json', 'utf8'));
        const cobrapedia_db_raw = JSON.parse(fs.readFileSync('cobrapedia.json', 'utf8'));
        const citations_db_raw = JSON.parse(fs.readFileSync('citations_cobrapedia.json', 'utf8'));

        // ==========================================
        // 2. PRÉPARATION DES QUESTIONS
        // ==========================================
        let quiz_db = quiz_db_raw.map(q => ({
            texte: q.texte, 
            propositions: q.propositions, 
            reponse: q.reponse, 
            explication: q.explication || q.indice || ""
        }));

        let cobra_terms = cobrapedia_db_raw.map(c => c.fr ? c.fr.terme : c.terme);
        let cobrapedia_db = cobrapedia_db_raw.map(c => {
            let terme = c.fr ? c.fr.terme : c.terme;
            let definition = c.fr ? c.fr.definition : c.definition;
            definition = definition.replace(/\[\d+\]/g, '').replace(/^[^a-zA-ZÀ-ÿ0-9]+/, '').trim();

            let distractors = cobra_terms.filter(t => t !== terme);
            let props = [terme];
            for(let i=0; i<3; i++) {
                let rIdx = Math.floor(Math.random() * distractors.length);
                props.push(distractors.splice(rIdx, 1)[0]);
            }
            props.sort();

            let extrait = definition.length > 240 ? definition.substring(0, 240) + "..." : definition;
            return {
                texte: `Quel concept correspond à cette transmission ?\n\n"${extrait}"`,
                propositions: props, 
                reponse: terme, 
                explication: definition
            };
        });

        const full_db = [...quiz_db, ...cobrapedia_db];

        // ==========================================
        // 3. SÉLECTION DÉTERMINISTE (JOUR UNIQUE)
        // ==========================================
        const joursEcoules = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
        
        // Sélection de la question du jour
        const indexDuJour = joursEcoules % full_db.length;
        const questionChoisie = full_db[indexDuJour];
        const indexBonneReponse = questionChoisie.propositions.indexOf(questionChoisie.reponse);
        const optionsSafe = questionChoisie.propositions.map(prop => 
            prop.length > 100 ? prop.substring(0, 97) + "..." : prop
        );

        // Sélection de la citation du jour
        const indexCitation = joursEcoules % citations_db_raw.length;
        const citationChoisie = citations_db_raw[indexCitation];

        // Signatures communes
        const urlSite = "https://leportaildelumiere.com";
        const urlApp = "https://play.google.com/store/apps/details?id=votre.id.app"; 
        const footerHTML = `\n\n🌐 <a href="${urlSite}">Le Portail de Lumière</a>\n📱 <a href="${urlApp}">Application Cobrapédia pour Android</a>`;

        // ==========================================
        // 4. DÉTERMINATION DU MOMENT (FENÊTRES UTC)
        // ==========================================
        const heureUTC = new Date().getUTCHours(); 
        
        // --- MARCHE 1 : MATIN (Sondage) ---
        // Cible le CRON de 06:00 UTC (08:00 Paris). Fenêtre active de 04h00 à 07h59 UTC.
        if (heureUTC >= 4 && heureUTC < 8) {
            const footerMatin = `\n\n<a href="${urlSite}">🌐 Le Portail</a> | <a href="${urlApp}">📱 Appli Android</a>`;
            const longueurFooterVisible = 35;

            let texteBrut = questionChoisie.explication.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            let maxTexte = 200 - longueurFooterVisible - 3;
            let explicationFinale = texteBrut.length > maxTexte 
                ? texteBrut.substring(0, maxTexte) + "..." + footerMatin 
                : texteBrut + footerMatin;
            
            const paramsQuiz = {
                chat_id: CHAT_ID,
                message_thread_id: THREAD_ID, // Redirection vers le sujet
                question: questionChoisie.texte.substring(0, 300),
                options: JSON.stringify(optionsSafe),
                type: 'quiz',
                correct_option_id: indexBonneReponse,
                explanation: explicationFinale,
                explanation_parse_mode: 'HTML'
            };

            const reponseTelegram = await envoyerAITelegram('sendPoll', paramsQuiz);
            if (reponseTelegram.ok) {
                console.log("✨ Succès : Épreuve du matin publiée !");
            } else {
                console.error("🕸️ Erreur Telegram (Matin) :", reponseTelegram.description);
            }

        // --- MARCHE 2 : MIDI (Citation) ---
        // Cible le CRON de 08:00 UTC (10:00 Paris). Fenêtre active de 08h00 à 13h59 UTC.
        } else if (heureUTC >= 8 && heureUTC < 14) {
            
            const titreCentre = `⚡ <b>— LA PENSÉE DU ROYAGE —</b>`;
            
            const messageCitation = titreCentre + `\n\n` +
                                    `<i>"${citationChoisie.texte_fr}"</i>\n\n` +
                                    `\u2003\u2003<b>✍️ — Cobrapédia —</b>` +
                                    footerHTML;

            const paramsCitation = {
                chat_id: CHAT_ID,
                message_thread_id: THREAD_ID, // Redirection vers le sujet
                text: messageCitation,
                parse_mode: 'HTML',
                disable_web_page_preview: true 
            };

            const reponseTelegram = await envoyerAITelegram('sendMessage', paramsCitation);
            if (reponseTelegram.ok) {
                console.log("📜 Succès : Pensée du jour publiée !");
            } else {
                console.error("🕸️ Erreur Telegram (Citation) :", reponseTelegram.description);
            }

        // --- MARCHE 3 : SOIR (Résolution) ---
        // Cible le CRON de 18:00 UTC (20:00 Paris). Fenêtre active à partir de 14h00 UTC.
        } else {
            const messageResolution = `✨ <b>Résolution de l'Épreuve du Jour</b>\n\n` +
                                      `La bonne réponse était : <b>${questionChoisie.reponse}</b>\n\n` +
                                      `📚 <b>Transmission complète :</b>\n<i>${questionChoisie.explication}</i>` + 
                                      footerHTML;

            const paramsResolution = {
                chat_id: CHAT_ID,
                message_thread_id: THREAD_ID, // Redirection vers le sujet
                text: messageResolution,
                parse_mode: 'HTML',
                disable_web_page_preview: true 
            };

            const reponseTelegram = await envoyerAITelegram('sendMessage', paramsResolution);
            if (reponseTelegram.ok) {
                console.log("🌌 Succès : Résolution du soir publiée !");
            } else {
                console.error("🕸️ Erreur Telegram (Soir) :", reponseTelegram.description);
            }
        }

    } catch (error) {
        console.error("Interférence majeure :", error);
    }
}

// ==========================================
// 5. MOTEUR DE COMMUNICATION TELEGRAM
// ==========================================
async function envoyerAITelegram(methode, corps) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${methode}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps)
    });
    return await response.json();
}

// Lancement du script
executerRituelQuotidien();
