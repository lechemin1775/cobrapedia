const fs = require('fs');

// ==========================================
// 0. OUTIL DE MÉLANGE (Algorithme Fisher-Yates)
// ==========================================
function melangerTableau(tableau) {
    let tab = [...tableau]; 
    for (let i = tab.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tab[i], tab[j]] = [tab[j], tab[i]];
    }
    return tab;
}

// ==========================================
// 1. CONFIGURATION DU BOT 
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; 
const CHAT_ID = "-1001707713364";  
const THREAD_ID = "13963"; 

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
        // 3. SÉLECTION ET GESTION DES FORMATS VRAI/FAUX
        // ==========================================
        const joursEcoules = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
        
        // Sélection de la question du jour
        const indexDuJour = joursEcoules % full_db.length;
        let questionChoisie = Object.assign({}, full_db[indexDuJour]); 

        // 🕸️ DÉTECTION D'INTERFÉRENCE DÉTERMINISTE (Synchronisée Matin/Soir)
        const chanceInterference = (joursEcoules * 13) % 100; 
        const isInterference = (chanceInterference < 25);     
        
        let reponseOriginale = questionChoisie.reponse || "";
        let texteQuestionTelegram = "";

        if (isInterference) {
            let vraieReponseNorm = reponseOriginale.trim().toLowerCase();
            
            let estVrai = ((joursEcoules * 17) % 2 === 0); 
            let texteAffirme = "";

            if (estVrai) {
                texteAffirme = reponseOriginale;
            } else {
                let faussesPropositions = questionChoisie.propositions.filter(p => 
                    p.trim().toLowerCase() !== vraieReponseNorm
                );
                let indexFausse = (joursEcoules * 7) % faussesPropositions.length;
                texteAffirme = faussesPropositions[indexFausse] || "Illusion de la Matrice.";
            }

            // Titre doux et rassurant pour la communauté
            texteQuestionTelegram = `✨ **ÉPREUVE DU JOUR** ✨\n\n*L'affirmation suivante est-elle VRAIE ou FAUSSE ?*\n\n${questionChoisie.texte}\n\n« ${texteAffirme} »`;
            questionChoisie.propositions = ["VRAI", "FAUX"];
            questionChoisie.reponse = estVrai ? "VRAI" : "FAUX";
            questionChoisie.estVrai = estVrai;
        } else {
            // Titre classique pour les questions à 4 choix
            texteQuestionTelegram = `✨ **ÉPREUVE DU JOUR** ✨\n\n${questionChoisie.texte}`;
        }
        
        // Mélange des réponses (uniquement pour les QCM 4 choix)
        const propositionsFinales = isInterference ? questionChoisie.propositions : melangerTableau(questionChoisie.propositions);
        
        const optionsSafe = propositionsFinales.map(prop => 
            prop.length > 100 ? prop.substring(0, 97) + "..." : prop
        );

        // Sélection de la citation du jour
        const indexCitation = joursEcoules % citations_db_raw.length;
        const citationChoisie = citations_db_raw[indexCitation];

        // Signatures communes
        const urlSite = "https://leportaildelumiere.com";
        const urlApp = "https://play.google.com/store/apps/details?id=com.leportaildelumiere.encyclopedie"; 
        const footerHTML = `\n\n🌐 <a href="${urlSite}">Le Portail de Lumière</a>\n📱 <a href="${urlApp}">Application Cobrapédia pour Android</a>`;

        // ==========================================
        // 4. DÉTERMINATION DU MOMENT (FENÊTRES UTC)
        // ==========================================
        const heureUTC = new Date().getUTCHours(); 
        
        // --- MARCHE 1 : MATIN (08h00 Paris / 06h00 UTC) ---
        if (heureUTC >= 4 && heureUTC < 8) {
            
            const paramsPoll = {
                chat_id: CHAT_ID,
                message_thread_id: THREAD_ID, 
                question: texteQuestionTelegram.substring(0, 300),
                options: JSON.stringify(optionsSafe),
                type: 'regular', 
                is_anonymous: true
            };

            const reponseTelegram = await envoyerAITelegram('sendPoll', paramsPoll);
            if (reponseTelegram.ok) {
                console.log(`✨ Succès : Épreuve du matin publiée (Réponse cachée jusqu'à 20h) !`);
            } else {
                console.error("🕸️ Erreur Telegram (Matin) :", reponseTelegram.description);
            }

        // --- MARCHE 2 : MIDI (Citation à 10h00 Paris) ---
        } else if (heureUTC >= 8 && heureUTC < 14) {
            
            const titreCentre = `⚡ <b>— LA PENSÉE DU JOUR —</b>`;
            
            const messageCitation = titreCentre + `\n\n` +
                                    `<i>"${citationChoisie.texte_fr}"</i>\n\n` +
                                    `\u2003\u2003<b>✍️ — Cobrapédia —</b>` +
                                    footerHTML;

            const paramsCitation = {
                chat_id: CHAT_ID,
                message_thread_id: THREAD_ID, 
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

        // --- MARCHE 3 : SOIR (20h00 Paris / 18h00 UTC - Révélation de la Réponse) ---
        } else {
            let blocVerite = "";
            let texteReponse = `La bonne réponse était : <b>${questionChoisie.reponse}</b>`;
            
            // Si c'est une Interférence Vrai/Faux ET que c'était un mensonge
            if (isInterference && questionChoisie.estVrai === false) {
                blocVerite = `\n\n🛡️ <b>VÉRITÉ COSMIQUE :</b>\n<i>"${reponseOriginale}"</i>`;
            }

            const messageResolution = `✨ <b>RÉSOLUTION DE L'ÉPREUVE DU JOUR</b>\n\n` +
                                      `${texteReponse}` + 
                                      blocVerite + `\n\n` +
                                      `📚 <b>Transmission Akashique :</b>\n<i>${questionChoisie.explication}</i>` + 
                                      footerHTML;

            const paramsResolution = {
                chat_id: CHAT_ID,
                message_thread_id: THREAD_ID, 
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
