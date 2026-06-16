CREATE TABLE `financeirosProcesso` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoId` int NOT NULL,
	`tipoFinanceiroProcesso` enum('custas','honorarios','despesas','deposito','condenacao','reembolso','outro') NOT NULL DEFAULT 'custas',
	`descricao` varchar(500) NOT NULL,
	`valor` int NOT NULL,
	`data` timestamp NOT NULL,
	`pago` boolean NOT NULL DEFAULT false,
	`dataPagamento` timestamp,
	`criadoPorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financeirosProcesso_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `movimentacoesProcesso` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoId` int NOT NULL,
	`data` timestamp NOT NULL,
	`descricao` text NOT NULL,
	`tipoMovimentacao` enum('distribuicao','citacao','contestacao','audiencia','sentenca','recurso','despacho','decisao','peticao','transito_julgado','execucao','outro') NOT NULL DEFAULT 'outro',
	`origemMovimentacao` enum('manual','datajud') NOT NULL DEFAULT 'manual',
	`codigoDatajud` int,
	`usuarioId` int,
	`usuarioNome` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `movimentacoesProcesso_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `partesProcesso` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoId` int NOT NULL,
	`tipoParteProcesso` enum('autor','reu','terceiro','outro') NOT NULL DEFAULT 'autor',
	`nome` varchar(255) NOT NULL,
	`cpfCnpj` varchar(20),
	`representante` varchar(255),
	`observacoes` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partesProcesso_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prazosJuridicos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`tipoPrazo` enum('processual','contratual','administrativo','audiencia','recurso','interno','outro') NOT NULL DEFAULT 'processual',
	`processoId` int,
	`demandaId` int,
	`condominioId` int,
	`condominioNome` varchar(255),
	`responsavelId` int,
	`responsavelNome` varchar(255),
	`dataLimite` timestamp NOT NULL,
	`alertas` text,
	`statusPrazo` enum('pendente','concluido','cancelado','atrasado') NOT NULL DEFAULT 'pendente',
	`concluidoEm` timestamp,
	`observacoes` text,
	`criadoPorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prazosJuridicos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processosJudiciais` (
	`id` int AUTO_INCREMENT NOT NULL,
	`numeroCNJ` varchar(30) NOT NULL,
	`tribunal` varchar(20) NOT NULL,
	`tribunalAlias` varchar(50),
	`comarca` varchar(255),
	`vara` varchar(255),
	`classe` varchar(255),
	`assunto` varchar(500),
	`tipoProcesso` enum('civel','trabalhista','previdenciario','criminal','tributario','administrativo','outro') NOT NULL DEFAULT 'civel',
	`faseProcessual` enum('distribuicao','citacao','contestacao','instrucao','audiencia','sentenca','recurso','transito_julgado','execucao','arquivado','outro') NOT NULL DEFAULT 'distribuicao',
	`statusProcesso` enum('ativo','suspenso','arquivado','encerrado') NOT NULL DEFAULT 'ativo',
	`dataAjuizamento` timestamp,
	`dataUltimaMovimentacao` timestamp,
	`condominioId` int,
	`condominioNome` varchar(255),
	`demandaId` int,
	`advogadoId` int,
	`advogadoNome` varchar(255),
	`valorCausa` int,
	`valorCondenacao` int,
	`datajudId` varchar(200),
	`datajudSincronizadoEm` timestamp,
	`observacoes` text,
	`criadoPorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processosJudiciais_id` PRIMARY KEY(`id`)
);
