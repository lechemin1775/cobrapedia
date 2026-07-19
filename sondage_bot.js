const fs = require('fs');

// ==========================================
// 1. CONFIGURATION DU BOT 
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // La clé du BotFather
const CHAT_ID = "-1004485957788"; // Votre ID avec le tiret récupéré via l'astuce web

async function executerRituelQuotidien() {
    try {
        // 1. Chargement des bases (On ajoute les citations)
        const quiz_db_raw = JSON.parse(fs.readFileSync('quete_ascension.json', 'utf8'));
        const cobrapedia_db_raw = JSON.parse(fs.readFileSync('cobrapedia.json', 'utf8'));
        const citations_db_raw = JSON.parse(fs.readFileSync('citations_cobrapedia.json', 'utf8'));

        // 2. Préparation des questions
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

        // 3. Sélection déterministe basée sur le jour unique
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

        // 4. Détermination du moment (Trois marches distinctes)
        const heureActuelleParis = 10; 
        
        if (heureActuelleParis < 9) {
            // ==========================================
            // MARCHE 1 (08h00) : ENVOI DU SONDAGE
            // ==========================================
            const footerMatin = `\n\n<a href="${urlSite}">🌐 Le Portail</a> | <a href="${urlApp}">📱 Appli Android</a>`;
            const longueurFooterVisible = 35;

            let texteBrut = questionChoisie.explication.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            let maxTexte = 200 - longueurFooterVisible - 3;
            let explicationFinale = texteBrut.length > maxTexte 
                ? texteBrut.substring(0, maxTexte) + "..." + footerMatin 
                : texteBrut + footerMatin;
            
            const paramsQuiz = {
                chat_id: CHAT_ID,
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

        } else if (heureActuelleParis < 14) {
            // ==========================================
            // MARCHE 2 (10h00) : ENVOI DE LA CITATION
            // ==========================================
            const messageCitation = `⚡ <b>La Pensée du Jour</b>\n\n` +
                                    `<i>"${citationChoisie.texte_fr}"</i>\n\n` +
                                    `✍️ <b>Cobrapédia</b>` +
                                    footerHTML;

            const paramsCitation = {
                chat_id: CHAT_ID,
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

        } else {
            // ==========================================
            // MARCHE 3 (20h00) : ENVOI DE LA RÉSOLUTION
            // ==========================================
            const messageResolution = `✨ <b>Résolution de l'Épreuve du Jour</b>\n\n` +
                                      `La bonne réponse était : <b>${questionChoisie.reponse}</b>\n\n` +
                                      `📚 <b>Transmission complète :</b>\n<i>${questionChoisie.explication}</i>` + 
                                      footerHTML;

            const paramsResolution = {
                chat_id: CHAT_ID,
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

async function envoyerAITelegram(methode, corps) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${methode}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps)
    });
    return await response.json();
}

executerRituelQuotidien();
