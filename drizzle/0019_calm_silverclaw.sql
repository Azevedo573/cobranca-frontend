CREATE TABLE `reguaDisparos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reguaId` int NOT NULL,
	`posicaoId` int NOT NULL,
	`cobrancaId` int NOT NULL,
	`devedorId` int NOT NULL,
	`condominioId` int NOT NULL,
	`diasInadimplencia` int NOT NULL,
	`tipoAcao` varchar(50) NOT NULL,
	`mensagemGerada` text,
	`status` enum('pendente','enviado','erro','ignorado') NOT NULL DEFAULT 'pendente',
	`tentativaId` int,
	`dataDisparo` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reguaDisparos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reguaPosicoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reguaId` int NOT NULL,
	`diasInadimplencia` int NOT NULL,
	`tipoAcao` enum('whatsapp','email','sms','carta','ligacao','notificacao_interna') NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`template` text,
	`ordem` int NOT NULL DEFAULT 0,
	`ativa` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reguaPosicoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reguasCobranca` (
	`id` int AUTO_INCREMENT NOT NULL,
	`condominioId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`tipoCobranca` enum('todos','condominio','salao_jogos','churrasqueira','cota_extra','multa','outros') NOT NULL DEFAULT 'todos',
	`ativa` int NOT NULL DEFAULT 1,
	`ultimaExecucao` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reguasCobranca_id` PRIMARY KEY(`id`)
);
